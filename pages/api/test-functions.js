import { supabase } from '../../utils/supabase.js';
import { getFixturesBetweenDates, getFixtureOdds, getFixturePredictions } from '../../utils/sportmonk.js';
import { logInfo, logSuccess, logError } from '../../utils/logger.js';

// Función para procesar y almacenar fixtures (simplificada de update-fixtures.js)
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

// Endpoint principal
export default async function handler(req, res) {
  try {
    logInfo("Iniciando prueba de actualización de fixtures...");

    // Obtener fechas para la consulta (hoy y 7 días después)
    const today = new Date();
    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(today.getDate() + 7);

    const startDate = today.toISOString().split('T')[0];
    const endDate = sevenDaysLater.toISOString().split('T')[0];

    logInfo(`Obteniendo fixtures entre ${startDate} y ${endDate}...`);

    // Obtener y procesar los datos
    const fixturesData = await getFixturesBetweenDates(startDate, endDate);
    const processedCount = await processAndStoreFixtures(fixturesData);

    logSuccess(`Prueba completada: ${processedCount} fixtures procesados`);

    // Registrar la actualización
    await supabase
      .from('update_logs')
      .insert({
        entity_type: 'fixtures',
        operation_type: 'test_update',
        status: 'success',
        records_affected: processedCount,
        created_at: new Date().toISOString()
      });

    return res.status(200).json({
      success: true,
      processedCount,
      message: `Fixtures actualizados: ${processedCount}`
    });
  } catch (error) {
    logError("Error en la prueba:", error);

    // Registrar el error
    await supabase
      .from('update_logs')
      .insert({
        entity_type: 'fixtures',
        operation_type: 'test_update',
        status: 'error',
        error_message: error.message,
        created_at: new Date().toISOString()
      });

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}