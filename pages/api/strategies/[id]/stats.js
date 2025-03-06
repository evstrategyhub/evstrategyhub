import { createClient } from '@supabase/supabase-js';

// Inicializar cliente de Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Este endpoint solo acepta solicitudes GET
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }
  
  const { id } = req.query; // ID de la estrategia
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Se requiere ID de estrategia'
    });
  }
  
  try {
    // 1. Obtener la estrategia
    const { data: strategy, error: strategyError } = await supabase
      .from('betting_strategies')
      .select('*')
      .eq('id', id)
      .single();
    
    if (strategyError) throw strategyError;
    if (!strategy) {
      return res.status(404).json({
        success: false,
        error: 'Estrategia no encontrada'
      });
    }
    
    // 2. Obtener las estadísticas
    const { data: stats, error: statsError } = await supabase
      .from('strategy_stats')
      .select('*')
      .eq('strategy_id', id)
      .single();
    
    if (statsError) throw statsError;
    
    // 3. Obtener el historial de bankroll
    const { data: bankrollHistory, error: historyError } = await supabase
      .from('bankroll_history')
      .select('*')
      .eq('strategy_id', id)
      .order('created_at', { ascending: true });
    
    if (historyError) throw historyError;
    
    // 4. Obtener distribución de selecciones por mercado
    const { data: marketDistribution, error: marketError } = await supabase
      .from('strategy_selections')
      .select('market_id, count(*)')
      .eq('strategy_id', id)
      .group('market_id');
    
    if (marketError) throw marketError;
    
    // 5. Obtener distribución de selecciones por bookmaker
    const { data: bookmakerDistribution, error: bookmakerError } = await supabase
      .from('strategy_selections')
      .select('bookmaker_id, count(*)')
      .eq('strategy_id', id)
      .group('bookmaker_id');
    
    if (bookmakerError) throw bookmakerError;
    
    // 6. Calcular estadísticas adicionales
    const additionalStats = {
      profit_loss_percentage: strategy.initial_bankroll > 0 
        ? ((strategy.current_bankroll - strategy.initial_bankroll) / strategy.initial_bankroll) * 100
        : 0,
      average_stake: stats.total_bets > 0 
        ? stats.total_staked / stats.total_bets 
        : 0,
      hit_rate: stats.total_bets > 0 
        ? (stats.won_bets / stats.total_bets) * 100 
        : 0,
      average_odds: stats.total_bets > 0 
        ? (stats.total_returns / stats.total_staked) 
        : 0,
      bankroll_history: bankrollHistory,
      market_distribution: marketDistribution,
      bookmaker_distribution: bookmakerDistribution,
      // Datos para la gráfica de evolución
      evolution_data: bankrollHistory.map(entry => ({
        date: entry.created_at,
        bankroll: entry.amount,
        change: entry.change_amount
      }))
    };
    
    // 7. Calcular métricas de rendimiento
    const performanceMetrics = {
      daily_roi: calculatePeriodicROI(bankrollHistory, 'day'),
      weekly_roi: calculatePeriodicROI(bankrollHistory, 'week'),
      monthly_roi: calculatePeriodicROI(bankrollHistory, 'month'),
      volatility: calculateVolatility(bankrollHistory),
      sharpe_ratio: calculateSharpeRatio(bankrollHistory),
      best_day: findBestPerformance(bankrollHistory, 'day'),
      worst_day: findWorstPerformance(bankrollHistory, 'day')
    };
    
    return res.status(200).json({
      success: true,
      data: {
        strategy,
        stats,
        additional_stats: additionalStats,
        performance_metrics: performanceMetrics
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Función para calcular ROI periódico (diario, semanal, mensual)
function calculatePeriodicROI(bankrollHistory, period) {
  if (!bankrollHistory || bankrollHistory.length < 2) return 0;
  
  const now = new Date();
  let cutoffDate;
  
  if (period === 'day') {
    cutoffDate = new Date(now.setDate(now.getDate() - 1));
  } else if (period === 'week') {
    cutoffDate = new Date(now.setDate(now.getDate() - 7));
  } else if (period === 'month') {
    cutoffDate = new Date(now.setMonth(now.getMonth() - 1));
  }
  
  const periodEntries = bankrollHistory.filter(entry => 
    new Date(entry.created_at) >= cutoffDate
  );
  
  if (periodEntries.length < 2) return 0;
  
  const firstAmount = periodEntries[0].amount;
  const lastAmount = periodEntries[periodEntries.length - 1].amount;
  
  return ((lastAmount - firstAmount) / firstAmount) * 100;
}

// Función para calcular volatilidad (desviación estándar de los cambios)
function calculateVolatility(bankrollHistory) {
  if (!bankrollHistory || bankrollHistory.length < 3) return 0;
  
  const changes = bankrollHistory
    .slice(1) // Ignorar el depósito inicial
    .map(entry => entry.change_percentage || 0);
  
  const mean = changes.reduce((sum, change) => sum + change, 0) / changes.length;
  
  const squaredDiffs = changes.map(change => Math.pow(change - mean, 2));
  const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / changes.length;
  
  return Math.sqrt(variance);
}

// Función para calcular Sharpe Ratio (rendimiento ajustado al riesgo)
function calculateSharpeRatio(bankrollHistory) {
  if (!bankrollHistory || bankrollHistory.length < 3) return 0;
  
  const riskFreeRate = 0.02 / 365; // Tasa libre de riesgo diaria (2% anual)
  
  const changes = bankrollHistory
    .slice(1) // Ignorar el depósito inicial
    .map(entry => entry.change_percentage / 100 || 0); // Convertir a decimal
  
  const meanReturn = changes.reduce((sum, change) => sum + change, 0) / changes.length;
  const excessReturn = meanReturn - riskFreeRate;
  
  const squaredDiffs = changes.map(change => Math.pow(change - meanReturn, 2));
  const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / changes.length;
  const volatility = Math.sqrt(variance);
  
  if (volatility === 0) return 0;
  return excessReturn / volatility;
}

// Función para encontrar el mejor día/semana
function findBestPerformance(bankrollHistory, period) {
  if (!bankrollHistory || bankrollHistory.length < 2) {
    return { date: null, change: 0, percentage: 0 };
  }
  
  // Agrupar por día/semana/mes
  const periodicChanges = {};
  
  bankrollHistory.slice(1).forEach(entry => {
    let key;
    const date = new Date(entry.created_at);
    
    if (period === 'day') {
      key = date.toISOString().split('T')[0]; // YYYY-MM-DD
    } else if (period === 'week') {
      const weekNumber = getWeekNumber(date);
      key = `${date.getFullYear()}-W${weekNumber}`;
    } else if (period === 'month') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    if (!periodicChanges[key]) {
      periodicChanges[key] = {
        date: key,
        change: 0,
        percentage: 0,
        initial: entry.previous_amount
      };
    }
    
    periodicChanges[key].change += entry.change_amount;
    periodicChanges[key].final = entry.amount;
  });
  
  // Calcular porcentajes
  Object.keys(periodicChanges).forEach(key => {
    const data = periodicChanges[key];
    data.percentage = (data.change / data.initial) * 100;
  });
  
  // Encontrar el mejor
  const best = Object.values(periodicChanges)
    .sort((a, b) => b.percentage - a.percentage)[0];
  
  return best || { date: null, change: 0, percentage: 0 };
}

// Función para encontrar el peor día/semana
function findWorstPerformance(bankrollHistory, period) {
  if (!bankrollHistory || bankrollHistory.length < 2) {
    return { date: null, change: 0, percentage: 0 };
  }
  
  // Similar a findBestPerformance pero ordenando de menor a mayor
  // Implementación igual a la anterior pero con ordenación inversa
  const periodicChanges = {};
  
  bankrollHistory.slice(1).forEach(entry => {
    let key;
    const date = new Date(entry.created_at);
    
    if (period === 'day') {
      key = date.toISOString().split('T')[0]; // YYYY-MM-DD
    } else if (period === 'week') {
      const weekNumber = getWeekNumber(date);
      key = `${date.getFullYear()}-W${weekNumber}`;
    } else if (period === 'month') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    if (!periodicChanges[key]) {
      periodicChanges[key] = {
        date: key,
        change: 0,
        percentage: 0,
        initial: entry.previous_amount
      };
    }
    
    periodicChanges[key].change += entry.change_amount;
    periodicChanges[key].final = entry.amount;
  });
  
  // Calcular porcentajes
  Object.keys(periodicChanges).forEach(key => {
    const data = periodicChanges[key];
    data.percentage = (data.change / data.initial) * 100;
  });
  
  // Encontrar el peor
  const worst = Object.values(periodicChanges)
    .sort((a, b) => a.percentage - b.percentage)[0];
  
  return worst || { date: null, change: 0, percentage: 0 };
}

// Función para obtener el número de semana del año
function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}
