import { createClient } from '@supabase/supabase-js';
import { getFixtureOdds } from '../../../utils/sportmonk.js';
import { logInfo, logError, logSuccess } from '../../../utils/logger.js';

// Configuración de Supabase
const SUPABASE_URL = "https://nxhvjyfvdirhplgfpdkm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54aHZqeWZ2ZGlyaHBsZ2ZwZGttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDkzNzI1OCwiZXhwIjoyMDU2NTEzMjU4fQ.tflcdU-SgN-ODFXuimdEfAdvDDlvMoRNCqWZirYCj9Y";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SELECTED_BOOKMAKERS = [2, 9, 20, 26, 28, 29, 35, 39];
const SELECTED_MARKETS = [1, 14, 57, 29, 80, 17, 46, 40, 101, 36, 22, 37];

async function getUpcomingFixtures(limit = 10) {
  const now = new Date();
  const nowTimestamp = Math.floor(now.getTime() / 1000);

  const { data, error } = await supabase
    .from('fixtures')
    .select('id, name')
    .gt('starting_at_timestamp', nowTimestamp)
    .eq('state_id', 1)
    .eq('has_odds', true)
    .order('starting_at_timestamp', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Error al obtener fixtures: ${error.message}`);
  }

  return data || [];
}

function filterOdds(oddsData, selectedBookmakers, selectedMarkets) {
  if (!oddsData || !oddsData.data || !oddsData.data.odds) {
    return [];
  }

  return oddsData.data.odds.filter(odd =>
    selectedBookmakers.includes(odd.bookmaker_id) &&
    selectedMarkets.includes(odd.market_id)
  );
}

async function processAndStoreOdds(fixtureId, filteredOdds) {
  if (!filteredOdds || filteredOdds.length === 0) {
    return 0;
  }

  const odds = filteredOdds.map(odd => ({
    id: odd.id,
    fixture_id: fixtureId,
    bookmaker_id: odd.bookmaker_id,
    market_id: odd.market_id,
    label: odd.label,
    value: odd.value,
    probability: odd.probability,
    market_description: odd.market_description,
    total: odd.total || null,
    handicap: odd.handicap || null
  }));

  const { error } = await supabase
    .from('odds')
    .upsert(odds, { onConflict: 'id' });

  if (error) {
    throw new Error(`Error al almacenar odds: ${error.message}`);
  }

  return odds.length;
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

    logInfo("Iniciando actualización de odds...");

    const fixtures = await getUpcomingFixtures(10);
    logInfo(`Se procesarán odds para ${fixtures.length} partidos`);

    let totalProcessed = 0;
    let errorsCount = 0;

    for (const fixture of fixtures) {
      try {
        logInfo(`Obteniendo odds para partido ID ${fixture.id} (${fixture.name})...`);

        if (totalProcessed > 0) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

        const oddsData = await getFixtureOdds(fixture.id);
        const filteredOdds = filterOdds(oddsData, SELECTED_BOOKMAKERS, SELECTED_MARKETS);
        const processedCount = await processAndStoreOdds(fixture.id, filteredOdds);

        logSuccess(`Procesadas ${processedCount} odds para partido ${fixture.id}`);
        totalProcessed += processedCount;
      } catch (error) {
        logError(`Error procesando odds para partido ${fixture.id}:`, error);
        errorsCount++;
      }
    }

    await logUpdate(
      'odds',
      'batch_update',
      errorsCount === 0 ? 'success' : 'partial_success',
      totalProcessed
    );

    return res.status(200).json({
      success: true,
      totalProcessed,
      errors: errorsCount,
      message: `Odds actualizadas: ${totalProcessed} (Errores: ${errorsCount})`
    });
  } catch (error) {
    logError("Error en la actualización de odds:", error);

    await logUpdate(
      'odds',
      'batch_update',
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