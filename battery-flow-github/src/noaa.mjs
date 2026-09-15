export const STATION = Object.freeze({ id: '8518750', name: 'The Battery', latitude: 40.7006, longitude: -74.0142, datum: 'MLLW', unit: 'm', timezone: 'UTC' });
export const NOAA_ENDPOINT = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const CACHE_MS = 5 * 60_000;
const STALE_MS = 30 * 60_000;

export function parseSeries(payload, key = 'data') {
  if (payload?.error) throw new Error(payload.error.message || 'NOAA returned an error');
  if (!Array.isArray(payload?.[key])) throw new Error('NOAA returned an unexpected response');
  return payload[key].flatMap(row => {
    const time = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(row.t || '') ? `${row.t.replace(' ', 'T')}:00Z` : null;
    const value = row.v === '' || row.v == null ? NaN : Number(row.v);
    if (!time || !Number.isFinite(Date.parse(time)) || !Number.isFinite(value)) return [];
    return [{ time, value, quality: row.q || (key === 'predictions' ? 'prediction' : 'unknown'), flags: row.f || null }];
  }).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

export function dateArgument(date) { return date.toISOString().slice(0, 10).replaceAll('-', ''); }

export function createNoaaService({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  let cache = null;
  let inFlight = null;
  let nextAttemptAt = 0;
  const sourceUrls = {};
  async function get(product) {
    const options = { application: 'BatteryFlowResearch', station: STATION.id, datum: STATION.datum, time_zone: 'gmt', units: 'metric', format: 'json', product };
    if (product === 'predictions') {
      options.begin_date = dateArgument(new Date(now() - 24 * 3600_000));
      options.end_date = dateArgument(new Date(now() + 36 * 3600_000));
      options.interval = '6';
    } else options.date = 'recent';
    const url = `${NOAA_ENDPOINT}?${new URLSearchParams(options)}`;
    sourceUrls[product] = url;
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`NOAA HTTP ${response.status}`);
    return parseSeries(await response.json(), product === 'predictions' ? 'predictions' : 'data');
  }
  function response() {
    const latest = cache?.observations.at(-1) || null;
    const ageMinutes = latest ? Math.max(0, (now() - Date.parse(latest.time)) / 60_000) : null;
    const fetchAge = cache?.observationFetchedAt ? now() - Date.parse(cache.observationFetchedAt) : Infinity;
    const status = !latest ? 'unavailable' : ageMinutes > 30 || fetchAge > STALE_MS || cache.observationError ? 'stale' : 'live';
    return { station: STATION, status, fetchedAt: cache?.fetchedAt || null, servedAt: new Date(now()).toISOString(), latest, ageMinutes, observations: cache?.observations || [], predictions: cache?.predictions || [], observationError: cache?.observationError || null, predictionError: cache?.predictionError || null, sourceUrls, disclaimer: 'Water-level observations and astronomical tide predictions only. This station does not measure microbial concentration or a two-dimensional current field.' };
  }
  async function refresh() {
    const [observed, predicted] = await Promise.allSettled([get('water_level'), get('predictions')]);
    const stamp = new Date(now()).toISOString();
    cache = {
      fetchedAt: stamp,
      observationFetchedAt: observed.status === 'fulfilled' ? stamp : cache?.observationFetchedAt,
      observations: observed.status === 'fulfilled' ? observed.value : cache?.observations || [],
      predictions: predicted.status === 'fulfilled' ? predicted.value : cache?.predictions || [],
      observationError: observed.status === 'rejected' ? 'NOAA water levels could not be refreshed.' : observed.value.length ? null : 'No recent NOAA observations were returned.',
      predictionError: predicted.status === 'rejected' ? 'NOAA tide predictions could not be refreshed.' : null
    };
    nextAttemptAt = now() + (observed.status === 'fulfilled' ? CACHE_MS : 60_000);
  }
  return {
    async read() {
      if (now() >= nextAttemptAt) {
        if (!inFlight) inFlight = refresh().finally(() => { inFlight = null; });
        await inFlight;
      }
      return response();
    }
  };
}
