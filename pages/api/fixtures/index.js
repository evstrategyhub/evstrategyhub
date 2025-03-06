import { supabase } from '../../../utils/supabase';

export default async function handler(req, res) {
  // Solo permitir método GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Extraer parámetros de consulta
    const { 
      startDate, 
      endDate, 
      league_id, 
      limit = 50,
      offset = 0
    } = req.query;
    
    // Establecer fechas predeterminadas si no se proporcionan
    let dateRange = { startDate, endDate };
    if (!startDate || !endDate) {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + 7); // Próximos 7 días por defecto
      
      dateRange.startDate = today.toISOString().split('T')[0];
      dateRange.endDate = futureDate.toISOString().split('T')[0];
    }
    
    // Construir la consulta base
    let query = supabase
      .from('fixtures')
      .select(`
        *,
        league_id
      `)
      .gte('starting_at', dateRange.startDate)
      .lte('starting_at', `${dateRange.endDate}T23:59:59`)
      .eq('state_id', 1) // Solo partidos programados
      .order('starting_at', { ascending: true });
    
    // Agregar filtros adicionales si están presentes
    if (league_id) {
      query = query.eq('league_id', league_id);
    }
    
    // Aplicar paginación
    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    // Ejecutar la consulta
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    // Devolver los resultados
    return res.status(200).json({
      success: true,
      count: data.length,
      data: data
    });
    
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      success: false,
      error: "Error al obtener los partidos",
      details: error.message
    });
  }
}
