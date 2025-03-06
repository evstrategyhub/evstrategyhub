import { createClient } from '@supabase/supabase-js';
import { getTeams } from '../../../utils/sportmonk.js';
import { logInfo, logError, logSuccess } from '../../../utils/logger.js';

// Configuración de Supabase
const SUPABASE_URL = "https://nxhvjyfvdirhplgfpdkm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54aHZqeWZ2ZGlyaHBsZ2ZwZGttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDkzNzI1OCwiZXhwIjoyMDU2NTEzMjU4fQ.tflcdU-SgN-ODFXuimdEfAdvDDlvMoRNCqWZirYCj9Y";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function processAndStoreTeams(teamsData) {
  if (!teamsData || !teamsData.data || !Array.isArray(teamsData.data)) {
    return 0;
  }

  const teams = teamsData.data.map(team => ({
    id: team.id,
    name: team.name,
    short_code: team.short_code || null,
    country_id: team.country_id || null,
    logo_path: team.image_path || null,
    venue_id: team.venue_id || null,
    is_active: true
  }));

  if (teams.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from('teams')
    .upsert(teams, { onConflict: 'id' });

  if (error) {
    throw new Error(`Error al almacenar equipos: ${error.message}`);
  }

  return teams.length;
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

    logInfo("Iniciando actualización de equipos...");

    let totalProcessed = 0;
    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages && currentPage <= 10) {
      logInfo(`Obteniendo equipos - página ${currentPage}...`);

      if (currentPage > 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      const teamsData = await getTeams(currentPage);
      const processedCount = await processAndStoreTeams(teamsData);
      totalProcessed += processedCount;

      logSuccess(`Procesados ${processedCount} equipos de la página ${currentPage}`);

      if (teamsData.meta && teamsData.meta.pagination) {
        hasMorePages = currentPage < teamsData.meta.pagination.total_pages;
        currentPage++;
      } else {
        hasMorePages = false;
      }
    }

    await logUpdate(
      'teams',
      'full_update',
      'success',
      totalProcessed
    );

    return res.status(200).json({
      success: true,
      totalProcessed,
      message: `Equipos actualizados: ${totalProcessed}`
    });
  } catch (error) {
    logError("Error en la actualización de equipos:", error);

    await logUpdate(
      'teams',
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