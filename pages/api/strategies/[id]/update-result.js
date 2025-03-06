import { createClient } from '@supabase/supabase-js';

// Inicializar cliente de Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Este endpoint solo acepta solicitudes POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }
  
  const { selection_id, result, is_winner } = req.body;
  
  if (!selection_id || result === undefined || is_winner === undefined) {
    return res.status(400).json({
      success: false,
      error: 'Se requieren selection_id, result y is_winner'
    });
  }
  
  try {
    // Comenzar una transacción
    // 1. Obtener la selección
    const { data: selection, error: selectionError } = await supabase
      .from('strategy_selections')
      .select('*, betting_strategies!inner(*)')
      .eq('id', selection_id)
      .single();
    
    if (selectionError) throw selectionError;
    if (!selection) {
      return res.status(404).json({
        success: false,
        error: 'Selección no encontrada'
      });
    }
    
    // Verificar si la selección ya tiene un resultado
    if (selection.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Esta selección ya tiene un resultado registrado'
      });
    }
    
    // 2. Calcular profit/loss
    const profitLoss = is_winner 
      ? selection.applied_stake * (parseFloat(selection.odd_value) - 1) 
      : -selection.applied_stake;
    
    // 3. Actualizar la selección con el resultado
    const { error: updateError } = await supabase
      .from('strategy_selections')
      .update({
        result,
        is_winner,
        profit_loss: profitLoss,
        status: is_winner ? 'won' : 'lost'
      })
      .eq('id', selection_id);
    
    if (updateError) throw updateError;
    
    // 4. Actualizar el bankroll de la estrategia
    const newBankroll = selection.betting_strategies.current_bankroll + profitLoss;
    
    const { error: strategyError } = await supabase
      .from('betting_strategies')
      .update({
        current_bankroll: newBankroll,
        updated_at: new Date().toISOString()
      })
      .eq('id', selection.strategy_id);
    
    if (strategyError) throw strategyError;
    
    // 5. Registrar el cambio en el historial de bankroll
    const { error: historyError } = await supabase
      .from('bankroll_history')
      .insert({
        strategy_id: selection.strategy_id,
        amount: newBankroll,
        previous_amount: selection.betting_strategies.current_bankroll,
        change_amount: profitLoss,
        change_percentage: (profitLoss / selection.betting_strategies.current_bankroll) * 100,
        entry_type: 'bet_result',
        description: `Resultado de apuesta: ${result}`,
        selection_id
      });
    
    if (historyError) throw historyError;
    
    // 6. Actualizar las estadísticas de la estrategia
    // Primero obtenemos las estadísticas actuales
    const { data: currentStats, error: statsGetError } = await supabase
      .from('strategy_stats')
      .select('*')
      .eq('strategy_id', selection.strategy_id)
      .single();
    
    if (statsGetError) throw statsGetError;
    
    // Actualizamos las estadísticas
    const newStats = {
      total_bets: currentStats.total_bets + 1,
      won_bets: is_winner ? currentStats.won_bets + 1 : currentStats.won_bets,
      lost_bets: !is_winner ? currentStats.lost_bets + 1 : currentStats.lost_bets,
      pending_bets: currentStats.pending_bets > 0 ? currentStats.pending_bets - 1 : 0,
      total_staked: currentStats.total_staked + selection.applied_stake,
      total_returns: is_winner 
        ? currentStats.total_returns + selection.applied_stake + profitLoss 
        : currentStats.total_returns,
      total_profit: currentStats.total_profit + profitLoss,
      roi: ((currentStats.total_profit + profitLoss) / (currentStats.total_staked + selection.applied_stake)) * 100,
      current_streak: is_winner ? currentStats.current_streak + 1 : 0,
      last_updated: new Date().toISOString()
    };
    
    // Si se consigue una nueva racha máxima
    if (is_winner && newStats.current_streak > currentStats.max_winning_streak) {
      newStats.max_winning_streak = newStats.current_streak;
    }
    
    const { error: statsUpdateError } = await supabase
      .from('strategy_stats')
      .update(newStats)
      .eq('strategy_id', selection.strategy_id);
    
    if (statsUpdateError) throw statsUpdateError;
    
    return res.status(200).json({
      success: true,
      data: {
        selection_id,
        result,
        is_winner,
        profit_loss: profitLoss,
        new_bankroll: newBankroll
      }
    });
  } catch (error) {
    console.error('Error al actualizar resultado:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
