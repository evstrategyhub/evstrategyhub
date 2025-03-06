import { supabase } from '../../../utils/supabase';

export default async function handler(req, res) {
  // Solo permitir método GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Parámetros opcionales
    const { is_active, limit = 50, offset = 0 } = req.query;
    
    // Construir consulta
    let query = supabase
      .from('leagues')
      .select('*')
      .order('name', { ascending: true });
    
    // Filtrar por is_active si se proporciona
    if (is_active !== undefined) {
      const activeValue = is_active === 'true';
      query = query.eq('is_active', activeValue);
    }
    
    // Aplicar paginación
    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    // Ejecutar consulta
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    // Devolver resultados
    return res.status(200).json({
      success: true,
      count: data.length,
      data: data
    });
    
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      success: false,
      error: "Error al obtener las ligas",
      details: error.message
    });
  }
}
