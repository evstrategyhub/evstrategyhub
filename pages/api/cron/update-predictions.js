import { createClient } from '@supabase/supabase-js';
import { getFixturePredictions } from '../../../utils/sportmonk.js';
import { logInfo, logError, logSuccess } from '../../../utils/logger.js';

// Configuración de Supabase
const SUPABASE_URL = "https://nxhvjyfvdirhplgfpdkm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54aHZqeWZ2ZGlyaHBsZ2ZwZGttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDkzNzI1OCwiZXhwIjoyMDU2NTEzMjU4fQ.tflcdU-SgN-ODFXuimdEfAdvDDlvMoRNCqWZirYCj9Y";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getUpcomingFixtures(limit = 20) {
  const now = new Date();
  const nowTimestamp = Math.floor(now.getTime() / 1000);

  const { data, error } = await supabase
    .from('fixtures')
    .select('id, name')
    .gt('starting_at_timestamp', nowTimestamp)
    .eq('state_id', 1)
    .order('starting_at_timestamp', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Error al obtener fixtures: ${error.message}`);
  }

  return data || [];
}

async function processAndStorePredictions(fixtureId, predictionsData) {
  if (!predictionsData || !predictionsData.data || !predictionsData.data.predictions) {
    return 0;
  }

  const predictions = predictionsData.data.predictions.map(prediction => ({
    id: prediction.id,
    fixture_id: fixtureId,
    type_id: prediction.type_id,
    predictions_json: JSON.stringify(prediction.predictions),
  }));

  if (predictions.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from('predictions')
    .upsert(predictions, { onConflict: 'id' });

  if (error) {
    throw new Error(`Error al almacenar predicciones: ${error.message}`);
  }

  return predictions.length;
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

    logInfo("Iniciando actualización de predicciones...");

    const fixtures = await getUpcomingFixtures(20);
    logInfo(`Se procesarán predicciones para ${fixtures.length} partidos`);

    let totalProcessed = 0;
    let errorsCount = 0;

    for (const fixture of fixtures) {
      try {
        logInfo(`Obteniendo predicciones para partido ID ${fixture.id} (${fixture.name})...`);

        if (totalProcessed > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const predictionsData = await getFixturePredictions(fixture.id);
        const processedCount = await processAndStorePredictions(fixture.id, predictionsData);

        logSuccess(`Procesadas ${processedCount} predicciones para partido ${fixture.id}`);
        totalProcessed += processedCount;
      } catch (error) {
        logError(`Error procesando predicciones para partido ${fixture.id}:`, error);
        errorsCount++;
      }
    }

    await logUpdate(
      'predictions',
      'batch_update',
      errorsCount === 0 ? 'success' : 'partial_success',
      totalProcessed
    );

    return res.status(200).json({
      success: true,
      totalProcessed,
      errors: errorsCount,
      message: `Predicciones actualizadas: ${totalProcessed} (Errores: ${errorsCount})`
    });
  } catch (error) {
    logError("Error en la actualización de predicciones:", error);

    await logUpdate(
      'predictions',
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