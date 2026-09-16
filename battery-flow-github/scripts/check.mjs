import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const required = ['public/index.html','public/style.css','public/app.js','public/model.js','public/imports.js','public/worker.js','public/vendor/leaflet.js','public/vendor/leaflet.css','public/vendor/space-grotesk.ttf','public/vendor/ibm-plex-mono.ttf','server.mjs','render.yaml','data/dep-snapshot.json','data/cso-snapshot.json','public/waterbody-boundaries.geojson'];
for (const file of required) await access(file);
for (const file of ['server.mjs','src/noaa.mjs','src/dep.mjs','src/stevens.mjs','src/sewers.mjs','public/app.js','public/model.js','public/imports.js','public/worker.js']) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${file}: ${result.stderr}`);
}
const html = await readFile('public/index.html', 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\/(?!\/)[^"#?]+)"/g)) await access(`public${match[1]}`);
console.log('Application files and JavaScript syntax verified. No frontend compilation is required.');
