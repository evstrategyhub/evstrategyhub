import fetch from 'node-fetch';

// Configuración de SportsMonk
const API_TOKEN = "OFni7bARihvquALzUS9p2PqhZHgy2t2DWHjgFperwEwxwxSm5DD5doL1gXEj";

async function fetchFromAPI(endpoint, params = {}) {
  const url = `https://api.sportmonks.com/v3/football/${endpoint}`;

  const headers = {
    "Authorization": API_TOKEN
  };

  const queryString = Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  const fullUrl = queryString ? `${url}?${queryString}` : url;

  try {
    const response = await fetch(fullUrl, { headers });

    if (!response.ok) {
      throw new Error(`Error en la respuesta de la API: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error al obtener datos de ${endpoint}:`, error);
    throw error;
  }
}

export function getFixturesBetweenDates(startDate, endDate) {
  return fetchFromAPI(`fixtures/between/${startDate}/${endDate}`);
}

export function getFixturePredictions(fixtureId) {
  return fetchFromAPI(`fixtures/${fixtureId}`, { include: "predictions" });
}

export function getFixtureOdds(fixtureId) {
  return fetchFromAPI(`fixtures/${fixtureId}`, { include: "odds" });
}

export function getTeams(page = 1) {
  return fetchFromAPI("teams", { page });
}

export function getLeagues(page = 1) {
  return fetchFromAPI("leagues", { include: "country", page });
}