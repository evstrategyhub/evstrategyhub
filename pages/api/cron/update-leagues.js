import { createClient } from '@supabase/supabase-js';
import { getLeagues } from '../../../utils/sportmonk.js';
import { logInfo, logError, logSuccess } from '../../../utils/logger.js';

// Configuración de Supabase
const SUPABASE_URL = "https://nxhvjyfvdirhplgfpdkm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54aHZqeWZ2ZGlyaHBsZ2ZwZGttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDkzNzI1OCwiZXhwIjoyMDU2NTEzMjU4fQ.tflcdU-SgN-ODFXuimdEfAdvDDlvMoRNCqWZirYCj9Y";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function processAndStoreLeagues(leaguesData) {
  if (!leaguesData || !leaguesData.data || !Array.isArray(leaguesData.data)) {
    return 0;
  }

  const leagues = leaguesData.data.map(league => ({
    id: league.id,
    name: league.name,
    country_id: league.country && league.country.id ? league.country.id : null,
    country_name: league.country && league.country.name ? league.country.name : null,
    logo_path: league.image_path || null,
    is_active: league.active || true,
    type: league.type || null
  }));

  if (leagues.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from('leagues')
    .upsert(leagues, { onConflict: 'id' });

  if (error) {
    throw new Error(`Error al almacenar ligas: ${error.message}`);
  }

  return leagues.length;
}

async function logUpdate(entityType, operationType, status, recordsAffected = 0, errorMessage = null) {
  try {
    await supabase
      .from('update_logs')
      .insert({
        entity_type: entityType,
        operation_type: operationType,
        status: status,
        records_affected: recordsAffected,
        error_message: errorMessage,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error("Error al registrar actualización:", error);
  }
}

export default async function handler(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    logInfo("Iniciando actualización de ligas...");

    let totalProcessed = 0;
    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages && currentPage <= 5) {
      logInfo(`Obteniendo ligas - página ${currentPage}...`);

      if (currentPage > 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      const leaguesData = await getLeagues(currentPage);
      const processedCount = await processAndStoreLeagues(leaguesData);
      totalProcessed += processedCount;

      logSuccess(`Procesadas ${processedCount} ligas de la página ${currentPage}`);

      if (leaguesData.meta && leaguesData.meta.pagination) {
        hasMorePages = currentPage < leaguesData.meta.pagination.total_pages;
        currentPage++;
      } else {
        hasMorePages = false;
      }
    }

    await logUpdate(
      'leagues',
      'full_update',
      'success',
      totalProcessed
    );

    return res.status(200).json({
      success: true,
      totalProcessed,
      message: `Ligas actualizadas: ${totalProcessed}`
    });
  } catch (error) {
    logError("Error en la actualización de ligas:", error);

    await logUpdate(
      'leagues',
      'full_update',
      'error',
      0,
      error.message
    );

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}