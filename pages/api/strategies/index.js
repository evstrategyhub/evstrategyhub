import { createClient } from '@supabase/supabase-js';

// Inicializar cliente de Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Verificar el método de solicitud
  if (req.method === 'GET') {
    return getStrategies(req, res);
  } else if (req.method === 'POST') {
    return createStrategy(req, res);
  }
  
  // Si el método no está permitido
  return res.status(405).json({ 
    success: false, 
    error: 'Method not allowed' 
  });
}

// Obtener estrategias del usuario
async function getStrategies(req, res) {
  try {
    // En una implementación real, obtendrías el ID del usuario desde el token
    const user_id = req.query.user_id || 'test-user-id';
    
    const { data, error } = await supabase
      .from('betting_strategies')
      .select(`
        *,
        strategy_stats(*)
      `)
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return res.status(200).json({
      success: true,
      count: data.length,
      data
    });
  } catch (error) {
    console.error('Error al obtener estrategias:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Crear una nueva estrategia
async function createStrategy(req, res) {
  try {
    const { name, description, initial_bankroll, currency, fractional_kelly } = req.body;
    
    // Validar campos requeridos
    if (!name || !initial_bankroll) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren nombre y bankroll inicial'
      });
    }
    
    // En una implementación real, obtendrías el ID del usuario desde el token
    const user_id = req.body.user_id || 'test-user-id';
    
    // Iniciar una transacción
    const { data: strategy, error: strategyError } = await supabase
      .from('betting_strategies')
      .insert({
        user_id,
        name,
        description,
        initial_bankroll,
        current_bankroll: initial_bankroll,  // Inicialmente igual al bankroll inicial
        currency: currency || 'USD',
        fractional_kelly: fractional_kelly || 1.0
      })
      .select()
      .single();
    
    if (strategyError) throw strategyError;
    
    // Crear registro inicial de bankroll
    const { error: bankrollError } = await supabase
      .from('bankroll_history')
      .insert({
        strategy_id: strategy.id,
        amount: initial_bankroll,
        previous_amount: 0,
        change_amount: initial_bankroll,
        change_percentage: null,
        entry_type: 'initial',
        description: 'Bankroll inicial'
      });
    
    if (bankrollError) throw bankrollError;
    
    // Crear registro de estadísticas
    const { error: statsError } = await supabase
      .from('strategy_stats')
      .insert({
        strategy_id: strategy.id
      });
    
    if (statsError) throw statsError;
    
    return res.status(201).json({
      success: true,
      data: strategy
    });
  } catch (error) {
    console.error('Error al crear estrategia:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
