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
  
  const { id } = req.query; // ID de la estrategia
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Se requiere ID de estrategia'
    });
  }
  
  const { operation_type, amount, description } = req.body;
  
  // Validar parámetros
  if (!operation_type || !amount) {
    return res.status(400).json({
      success: false,
      error: 'Se requieren operation_type y amount'
    });
  }
  
  // Validar el tipo de operación
  const validOperations = ['deposit', 'withdrawal', 'adjustment'];
  if (!validOperations.includes(operation_type)) {
    return res.status(400).json({
      success: false,
      error: `Tipo de operación no válido. Debe ser uno de: ${validOperations.join(', ')}`
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
    
    // 2. Calcular el nuevo bankroll según la operación
    let newBankroll = strategy.current_bankroll;
    let changeAmount = parseFloat(amount);
    
    if (operation_type === 'deposit') {
      newBankroll += changeAmount;
    } else if (operation_type === 'withdrawal') {
      // Validar que hay suficiente bankroll para retirar
      if (strategy.current_bankroll < changeAmount) {
        return res.status(400).json({
          success: false,
          error: 'No hay suficiente bankroll para realizar este retiro'
        });
      }
      newBankroll -= changeAmount;
      changeAmount = -changeAmount; // Cambiar a negativo para registrar correctamente
    } else if (operation_type === 'adjustment') {
      // Un ajuste puede ser positivo o negativo
      newBankroll += changeAmount;
    }
    
    // 3. Actualizar el bankroll de la estrategia
    const { error: updateError } = await supabase
      .from('betting_strategies')
      .update({
        current_bankroll: newBankroll,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (updateError) throw updateError;
    
    // 4. Registrar la operación en el historial
    const { error: historyError } = await supabase
      .from('bankroll_history')
      .insert({
        strategy_id: id,
        amount: newBankroll,
        previous_amount: strategy.current_bankroll,
        change_amount: changeAmount,
        change_percentage: (changeAmount / strategy.current_bankroll) * 100,
        entry_type: operation_type,
        description: description || `Operación manual: ${operation_type}`
      });
    
    if (historyError) throw historyError;
    
    return res.status(200).json({
      success: true,
      data: {
        operation_type,
        amount: changeAmount,
        previous_bankroll: strategy.current_bankroll,
        new_bankroll: newBankroll,
        change_percentage: (changeAmount / strategy.current_bankroll) * 100
      }
    });
  } catch (error) {
    console.error(`Error en operación de bankroll: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
