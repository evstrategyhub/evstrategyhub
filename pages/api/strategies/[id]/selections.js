import { createClient } from '@supabase/supabase-js';

// Inicializar cliente de Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query; // ID de la estrategia
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Se requiere ID de estrategia'
    });
  }
  
  // Verificar el método de solicitud
  if (req.method === 'GET') {
    return getSelections(req, res, id);
  } else if (req.method === 'POST') {
    return addSelection(req, res, id);
  }
  
  // Si el método no está permitido
  return res.status(405).json({ 
    success: false, 
    error: 'Method not allowed' 
  });
}

// Obtener selecciones de una estrategia
async function getSelections(req, res, strategy_id) {
  try {
    const { data: strategy, error: strategyError } = await supabase
      .from('betting_strategies')
      .select('*')
      .eq('id', strategy_id)
      .single();
    
    if (strategyError) throw strategyError;
    if (!strategy) {
      return res.status(404).json({
        success: false,
        error: 'Estrategia no encontrada'
      });
    }
    
    // Obtener las selecciones con información de los partidos
    const { data, error } = await supabase
      .from('strategy_selections')
      .select(`
        *,
        fixtures!inner(id, name, league_id, starting_at, state)
      `)
      .eq('strategy_id', strategy_id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return res.status(200).json({
      success: true,
      count: data.length,
      data
    });
  } catch (error) {
    console.error('Error al obtener selecciones:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Calcular EV (Expected Value)
function calculateEV(oddValue, predictionProbability) {
  // EV = (Probabilidad * (Cuota - 1)) - (1 - Probabilidad)
  const probability = predictionProbability / 100; // Convertir a decimal
  return (probability * (oddValue - 1)) - (1 - probability);
}

// Calcular Kelly (% de bankroll a apostar)
function calculateKelly(oddValue, predictionProbability) {
  const probability = predictionProbability / 100; // Convertir a decimal
  const impliedProbability = 1 / oddValue;
  
  // Kelly = (p*(b+1) - 1)/b donde p es probabilidad real y b es (cuota-1)
  const edge = probability - impliedProbability;
  if (edge <= 0) return 0; // No apostar si no hay ventaja
  
  const kelly = probability - ((1 - probability) / (oddValue - 1));
  // Limitar Kelly para evitar apuestas muy grandes
  return Math.min(kelly, 0.25); // Máximo 25% del bankroll
}

// Añadir selección a una estrategia
async function addSelection(req, res, strategy_id) {
  try {
    const { 
      fixture_id, 
      odd_id, 
      market_id, 
      bookmaker_id, 
      selection_label, 
      odd_value,
      prediction_probability 
    } = req.body;
    
    // Validar campos requeridos
    if (!fixture_id || !market_id || !bookmaker_id || !selection_label || !odd_value) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos para la selección'
      });
    }
    
    // Verificar que la estrategia existe
    const { data: strategy, error: strategyError } = await supabase
      .from('betting_strategies')
      .select('*')
      .eq('id', strategy_id)
      .single();
    
    if (strategyError) throw strategyError;
    if (!strategy) {
      return res.status(404).json({
        success: false,
        error: 'Estrategia no encontrada'
      });
    }
    
    // Calcular probabilidad implícita
    const implied_probability = (1 / parseFloat(odd_value)) * 100;
    
    // Calcular EV y Kelly
    const expected_value = prediction_probability 
      ? calculateEV(parseFloat(odd_value), parseFloat(prediction_probability))
      : null;
    
    const kelly_stake = prediction_probability 
      ? calculateKelly(parseFloat(odd_value), parseFloat(prediction_probability))
      : null;
    
    // Aplicar factor de Kelly fraccional
    const applied_kelly = kelly_stake ? kelly_stake * strategy.fractional_kelly : null;
    
    // Calcular monto a apostar
    const stake_percentage = applied_kelly;
    const applied_stake = applied_kelly ? strategy.current_bankroll * applied_kelly : null;
    
    // Calcular ganancia potencial
    const potential_profit = applied_stake ? applied_stake * (parseFloat(odd_value) - 1) : null;
    
    // Crear la selección
    const { data: selection, error: selectionError } = await supabase
      .from('strategy_selections')
      .insert({
        strategy_id,
        fixture_id,
        odd_id,
        market_id,
        bookmaker_id,
        selection_label,
        odd_value,
        implied_probability,
        prediction_probability,
        expected_value,
        kelly_stake,
        applied_stake,
        stake_percentage,
        potential_profit,
        status: 'pending'
      })
      .select()
      .single();
    
    if (selectionError) throw selectionError;
    
    return res.status(201).json({
      success: true,
      data: selection
    });
  } catch (error) {
    console.error('Error al añadir selección:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
