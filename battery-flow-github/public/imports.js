const fail = message => { throw new Error(message); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const timestamp = value => typeof value === 'string' && /T.*Z$/.test(value) && Number.isFinite(Date.parse(value));

export function validateField(input) {
  if (!input || input.schemaVersion !== 1 || input.kind !== 'hydrodynamic-field') fail('Expected a schemaVersion 1 hydrodynamic-field file.');
  if (input.crs !== 'EPSG:4326' || input.velocityUnits !== 'm/s') fail('Use EPSG:4326 coordinates and velocities in m/s.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) fail('A model name of 1–120 characters is required.');
  const { longitude: xs, latitude: ys, wetMask } = input.grid || {};
  for (const [label, values, min, max] of [['longitude', xs, -74.12, -73.85], ['latitude', ys, 40.58, 40.83]]) {
    if (!Array.isArray(values) || values.length < 2 || values.length > 100) fail(`${label}: use 2–100 grid coordinates.`);
    if (values.some((v, i) => !finite(v) || v < min || v > max || (i && v <= values[i - 1]))) fail(`${label}: coordinates must increase and lie within the NYC pilot bounds.`);
  }
  const n = xs.length * ys.length;
  if (n > 6000 || !Array.isArray(wetMask) || wetMask.length !== n || wetMask.some(v => v !== 0 && v !== 1)) fail('Provide a 0/1 wetMask with one entry per grid cell (maximum 6,000).');
  if (!wetMask.some(Boolean)) fail('The grid contains no wet cells.');
  if (!Array.isArray(input.times) || input.times.length < 2 || input.times.length > 145 || input.times.some((t, i) => !timestamp(t) || (i && Date.parse(t) <= Date.parse(input.times[i - 1])))) fail('Provide 2–145 strictly increasing UTC times ending in Z.');
  if (Date.parse(input.times.at(-1)) - Date.parse(input.times[0]) > 72 * 3600_000) fail('The pilot supports model windows up to 72 hours.');
  if (n * input.times.length > 400000) fail('This field is too large; thin the grid or time steps to at most 400,000 cell-times.');
  for (const key of ['u', 'v']) {
    if (!Array.isArray(input[key]) || input[key].length !== input.times.length) fail(`${key} must have one flattened grid per time step.`);
    for (const grid of input[key]) if (!Array.isArray(grid) || grid.length !== n || grid.some(v => !finite(v) || Math.abs(v) > 10)) fail(`${key}: all velocities must be finite numbers between -10 and 10 m/s. Use 0 in dry cells.`);
  }
  return { schemaVersion: 1, kind: input.kind, name: input.name.trim(), crs: input.crs, velocityUnits: input.velocityUnits, times: input.times, grid: { longitude: xs, latitude: ys, wetMask }, u: input.u, v: input.v, validationStatus: 'Not verified by this application', provenance: typeof input.provenance === 'string' ? input.provenance.slice(0, 1000) : 'Not supplied' };
}

export function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (quoted) fail('The CSV contains an unclosed quote.');
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseSamples(text) {
  const rows = parseCSV(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2 || rows.length > 2001) fail('Provide a header and 1–2,000 sample rows.');
  const headers = rows.shift();
  const required = ['id', 'latitude', 'longitude', 'collected_at', 'target', 'value', 'unit', 'qualifier'];
  if (required.some(key => !headers.includes(key)) || new Set(headers).size !== headers.length) fail(`CSV headers must include: ${required.join(', ')}.`);
  const ids = new Set();
  return rows.map((row, i) => {
    const r = Object.fromEntries(headers.map((k, j) => [k, row[j] || '']));
    if (row.length !== headers.length) fail(`Row ${i + 2}: column count does not match the header.`);
    const latitude = Number(r.latitude), longitude = Number(r.longitude), value = Number(r.value);
    if (!r.id || ids.has(r.id)) fail(`Row ${i + 2}: sample IDs must be present and unique.`);
    ids.add(r.id);
    if (!r.latitude || !r.longitude || !finite(latitude) || !finite(longitude) || latitude < 40.58 || latitude > 40.83 || longitude < -74.12 || longitude > -73.85) fail(`Row ${i + 2}: coordinates are outside the NYC pilot bounds.`);
    if (!timestamp(r.collected_at)) fail(`Row ${i + 2}: collected_at must be an ISO UTC timestamp ending in Z.`);
    if (!r.value || !finite(value) || value < 0 || !r.target || !r.unit || !['=', '<', '>'].includes(r.qualifier)) fail(`Row ${i + 2}: provide a nonnegative value, target, unit, and qualifier (=, <, or >).`);
    if (Object.values(r).some(v => v.length > 240)) fail(`Row ${i + 2}: a field is too long.`);
    return { id: r.id, latitude, longitude, collected_at: r.collected_at, target: r.target, value, unit: r.unit, qualifier: r.qualifier, method: r.method || 'Not supplied' };
  });
}
