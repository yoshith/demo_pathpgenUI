// Deliberately schematic demonstration domain. Not a surveyed shoreline or inundation mask.
export const WATER_RINGS = [
  [[-74.039,40.733],[-74.011,40.733],[-74.0125,40.719],[-74.0168,40.710],[-74.0182,40.702],[-74.0145,40.697],[-74.008,40.691],[-74.008,40.680],[-74.015,40.668],[-74.046,40.668],[-74.052,40.690],[-74.043,40.700],[-74.036,40.707],[-74.0335,40.716]],
  [[-74.015,40.697],[-74.005,40.700],[-73.993,40.707],[-73.975,40.715],[-73.970,40.709],[-73.983,40.703],[-73.994,40.696],[-74.007,40.688]]
];
const ISLAND = [[-74.0255,40.6855],[-74.0195,40.693],[-74.0125,40.690],[-74.0145,40.682],[-74.022,40.6785]];
export const DEFAULT_SOURCE = { latitude: 40.699, longitude: -74.024 };
const METERS_LAT = 111320;
const METERS_LON = 111320 * Math.cos(40.7 * Math.PI / 180);
const timeCache = new WeakMap();

function inside(x, y, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result;
  }
  return result;
}
export function inDemoWater(longitude, latitude) { return WATER_RINGS.some(r => inside(longitude, latitude, r)) && !inside(longitude, latitude, ISLAND); }

function bracket(values, x) {
  if (x < values[0] || x > values.at(-1)) return null;
  let lo = 0, hi = values.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (values[mid] <= x) lo = mid; else hi = mid; }
  return [lo, hi, (x - values[lo]) / (values[hi] - values[lo])];
}
export function modelVelocity(field, lon, lat, seconds) {
  if (seconds < 0) return null;
  const xb = bracket(field.grid.longitude, lon), yb = bracket(field.grid.latitude, lat);
  if (!timeCache.has(field)) timeCache.set(field, field.times.map(t => (Date.parse(t) - Date.parse(field.times[0])) / 1000));
  const relativeTimes = timeCache.get(field);
  const tb = bracket(relativeTimes, seconds);
  if (!xb || !yb || !tb) return null;
  const [x0,x1,xf] = xb, [y0,y1,yf] = yb, [t0,t1,tf] = tb;
  const width = field.grid.longitude.length;
  const cells = [y0*width+x0,y0*width+x1,y1*width+x0,y1*width+x1];
  const weights = [(1-xf)*(1-yf),xf*(1-yf),(1-xf)*yf,xf*yf];
  if (cells.some((c,i) => weights[i] > 1e-10 && !field.grid.wetMask[c])) return null;
  const interpolate = key => cells.reduce((sum,c,i) => sum + weights[i] * (field[key][t0][c]*(1-tf)+field[key][t1][c]*tf), 0);
  return { u: interpolate('u'), v: interpolate('v') };
}
export function velocityAt(config, lon, lat, seconds) {
  if (config.field) return modelVelocity(config.field, lon, lat, seconds);
  if (!inDemoWater(lon, lat)) return null;
  // Explicit user-set currents; never infer local velocities from a single tide gauge.
  const speed = config.speed;
  const direction = config.phase === 'inbound' ? 1 : -1;
  const tideFactor = 0.8 + 0.2 * Math.cos(seconds / 44712 * Math.PI * 2);
  const eastRiver = lon > -74.008 && lat > 40.692;
  return eastRiver ? { u: direction * speed * 0.85 * tideFactor, v: direction * speed * 0.50 * tideFactor } : { u: direction * speed * 0.12 * tideFactor, v: direction * speed * 0.96 * tideFactor };
}
function randomGenerator(seed = 20419) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function simulate(config) {
  const random = randomGenerator();
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2*Math.PI*random());
  const frameSeconds = 300;
  const totalSeconds = config.field ? Math.min(6*3600, (Date.parse(config.field.times.at(-1))-Date.parse(config.field.times[0]))/1000) : 6*3600;
  const duration = Math.floor(totalSeconds / frameSeconds) * frameSeconds;
  if (duration < frameSeconds) throw new Error('The imported field must span at least 5 minutes for playback.');
  if (!velocityAt(config, config.source.longitude, config.source.latitude, 0)) throw new Error('Place the release inside the available water-flow domain.');
  const count = 360, dt = 20, diffusionStep = Math.sqrt(2 * config.diffusion * dt);
  const decay = Math.log(2) / (config.halfLife * 3600);
  const releaseSeconds = config.releaseMinutes * 60;
  const particles = Array.from({length:count},(_,i) => ({ lon:config.source.longitude, lat:config.source.latitude, releasedAt: releaseSeconds === 0 ? 0 : i/(count-1)*releaseSeconds, alive:true }));
  const frames = [];
  let boundaryHolds = 0;
  for (let seconds=0; seconds<=duration; seconds+=dt) {
    if (seconds % frameSeconds === 0) {
      const visible = particles.filter(p=>p.alive && p.releasedAt<=seconds).map(p=>({ longitude:p.lon, latitude:p.lat, weight:Math.exp(-decay*(seconds-p.releasedAt))/count }));
      frames.push({ seconds, particles:visible, massFraction:visible.reduce((s,p)=>s+p.weight,0) });
    }
    if (seconds === duration) break;
    for (const p of particles) {
      if (!p.alive || p.releasedAt > seconds) continue;
      const velocity = velocityAt(config,p.lon,p.lat,seconds);
      if (!velocity) { p.alive=false;continue; }
      const lon=p.lon+(velocity.u*dt+diffusionStep*gaussian())/METERS_LON;
      const lat=p.lat+(velocity.v*dt+diffusionStep*gaussian())/METERS_LAT;
      if (velocityAt(config,lon,lat,Math.min(seconds+dt,duration))) {p.lon=lon;p.lat=lat;} else boundaryHolds++;
    }
  }
  return { frames, duration, boundaryHolds, method:'Seeded illustrative particle advection–diffusion with first-order decay; normalized release, no calibrated concentration or infectivity.', configuration:config };
}

export function plumeBins(frame, cellMeters=110) {
  const bins = new Map();
  for (const p of frame.particles) {
    const x=Math.floor(p.longitude*METERS_LON/cellMeters),y=Math.floor(p.latitude*METERS_LAT/cellMeters),key=`${x}:${y}`;
    const bin=bins.get(key)||{longitude:(x+.5)*cellMeters/METERS_LON,latitude:(y+.5)*cellMeters/METERS_LAT,mass:0};
    bin.mass+=p.weight;bins.set(key,bin);
  }
  return [...bins.values()];
}
