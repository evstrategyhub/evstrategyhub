import { createClient } from '@supabase/supabase-js';
import { getFixturesBetweenDates } from '../../../utils/sportmonk.js';
import { logInfo, logError, logSuccess } from '../../../utils/logger.js';

// Configuración de Supabase
const SUPABASE_URL = "https://nxhvjyfvdirhplgfpdkm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54aHZqeWZ2ZGlyaHBsZ2ZwZGttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDkzNzI1OCwiZXhwIjoyMDU2NTEzMjU4fQ.tflcdU-SgN-ODFXuimdEfAdvDDlvMoRNCqWZirYCj9Y";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Función para procesar y almacenar fixtures
async function processAndStoreFixtures(fixturesData) {
  if (!fixturesData || !fixturesData.data || !Array.isArray(fixturesData.data)) {
    return 0;
  }

  const fixtures = fixturesData.data.map(fixture => ({
    id: fixture.id,
    name: fixture.name,
    league_id: fixture.league_id,
    season_id: fixture.season_id,
    stage_id: fixture.stage_id,
    round_id: fixture.round_id,
    starting_at: fixture.starting_at,
    starting_at_timestamp: fixture.starting_at_timestamp,
    venue_id: fixture.venue_id,
    state_id: fixture.state_id,
    state: fixture.state_id === 1 ? "Programado" : fixture.state_id === 5 ? "Finalizado" : `Estado ${fixture.state_id}`,
    result_info: fixture.result_info,
    length: fixture.length,
    has_odds: fixture.has_odds,
    has_premium_odds: fixture.has_premium_odds
  }));

  if (fixtures.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from('fixtures')
    .upsert(fixtures, { onConflict: 'id' });

  if (error) {
    throw new Error(`Error al almacenar fixtures: ${error.message}`);
  }

  return fixtures.length;
}

// Función para registrar actualizaciones
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

    logInfo("Iniciando actualización de fixtures...");

    const today = new Date();
    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(today.getDate() + 7);

    const startDate = today.toISOString().split('T')[0];
    const endDate = sevenDaysLater.toISOString().split('T')[0];

    logInfo(`Obteniendo fixtures entre ${startDate} y ${endDate}...`);

    const fixturesData = await getFixturesBetweenDates(startDate, endDate);
    const processedCount = await processAndStoreFixtures(fixturesData);

    logSuccess(`Actualización completada: ${processedCount} fixtures procesados`);

    await logUpdate(
      'fixtures',
      'full_update',
      'success',
      processedCount
    );

    return res.status(200).json({
      success: true,
      processedCount,
      message: `Fixtures actualizados: ${processedCount}`
    });
  } catch (error) {
    logError("Error en la actualización de fixtures:", error);

    await logUpdate(
      'fixtures',
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