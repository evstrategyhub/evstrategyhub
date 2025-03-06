import { supabase } from '../../../utils/supabase';

export default async function handler(req, res) {
  // Solo permitir método GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Obtener el ID del partido de la URL
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Se requiere el ID del partido' });
    }
    
    // 1. Obtener información del partido
    const { data: fixture, error: fixtureError } = await supabase
      .from('fixtures')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fixtureError) throw fixtureError;
    
    if (!fixture) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }
    
    // 2. Obtener odds del partido
    const { data: odds, error: oddsError } = await supabase
      .from('odds')
      .select(`
        *,
        bookmaker:bookmaker_id(id, name),
        market:market_id(id, name)
      `)
      .eq('fixture_id', id);
    
    if (oddsError) throw oddsError;
    
    // 3. Obtener predicciones del partido
    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('*')
      .eq('fixture_id', id);
    
    if (predictionsError) throw predictionsError;
    
    // 4. Obtener información de la liga
    let league = null;
    if (fixture.league_id) {
      const { data: leagueData, error: leagueError } = await supabase
        .from('leagues')
        .select('*')
        .eq('id', fixture.league_id)
        .single();
      
      if (!leagueError) {
        league = leagueData;
      }
    }
    
    // 5. Preparar respuesta agrupando odds por casa de apuestas y mercado
    const groupedOdds = {};
    
    if (odds && odds.length > 0) {
      odds.forEach(odd => {
        const bookmakerID = odd.bookmaker_id;
        const marketID = odd.market_id;
        
        if (!groupedOdds[bookmakerID]) {
          groupedOdds[bookmakerID] = {
            id: odd.bookmaker?.id,
            name: odd.bookmaker?.name,
            markets: {}
          };
        }
        
        if (!groupedOdds[bookmakerID].markets[marketID]) {
          groupedOdds[bookmakerID].markets[marketID] = {
            id: odd.market?.id,
            name: odd.market?.name,
            options: []
          };
        }
        
        groupedOdds[bookmakerID].markets[marketID].options.push({
          label: odd.label,
          value: odd.value,
          probability: odd.probability,
          handicap: odd.handicap,
          total: odd.total
        });
      });
    }
    
    // 6. Calcular EV (Expected Value) básico para algunas predicciones
    // Este es un cálculo simplificado, puedes expandirlo según tus necesidades
    const evCalculations = [];
    
    // Buscar predicciones de tipo 1X2 (asumiendo tipo_id=237 para 1X2)
    const prediction1X2 = predictions?.find(p => p.type_id === 237);
    
    if (prediction1X2 && prediction1X2.predictions_json) {
      // Obtener odds para el mercado 1X2 (asumiendo market_id=1 para 1X2)
      const odds1X2 = odds?.filter(o => o.market_id === 1);
      
      if (odds1X2 && odds1X2.length > 0) {
        // Para cada opción (home/draw/away), calcular EV
        ['home', 'draw', 'away'].forEach(type => {
          const predictedProb = prediction1X2.predictions_json[type];
          
          if (predictedProb) {
            // Buscar odds correspondientes en todas las casas de apuestas
            odds1X2.forEach(odd => {
              if (odd.label.toLowerCase() === type || 
                  (odd.label === 'Home' && type === 'home') ||
                  (odd.label === 'Draw' && type === 'draw') ||
                  (odd.label === 'Away' && type === 'away')) {
                
                // Calcular EV: (probabilidad * ganancia) - (1 - probabilidad) * apuesta
                // Asumiendo apuesta = 1
                const probability = parseFloat(predictedProb) / 100;
                const oddValue = parseFloat(odd.value);
                const ev = (probability * (oddValue - 1)) - ((1 - probability) * 1);
                
                evCalculations.push({
                  type: odd.label,
                  bookmaker_id: odd.bookmaker_id,
                  bookmaker_name: odd.bookmaker?.name,
                  market_id: odd.market_id,
                  market_name: odd.market?.name,
                  odds: odd.value,
                  predicted_probability: predictedProb,
                  implied_probability: (1 / oddValue * 100).toFixed(2),
                  ev: ev.toFixed(4),
                  ev_percentage: (ev * 100).toFixed(2) + '%'
                });
              }
            });
          }
        });
      }
    }
    
    // 7. Devolver todos los datos recopilados
    return res.status(200).json({
      success: true,
      data: {
        fixture,
        league,
        odds: groupedOdds,
        predictions,
        ev_calculations: evCalculations
      }
    });
    
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      success: false,
      error: "Error al obtener la información del partido",
      details: error.message
    });
  }
}
