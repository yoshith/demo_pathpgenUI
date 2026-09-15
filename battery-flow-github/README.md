# Battery Flow

A self-contained NYC Battery research map for exploring microbial transport scenarios alongside NOAA water-level observations. Portable Node.js application prepared for Render.

**Scientific status:** working visualization and integration prototype. It is not a validated live pathogen forecast. The Battery tide gauge does not detect pathogens or supply a two-dimensional velocity field.

Start with [START-HERE.md](START-HERE.md) for GitHub upload and Render deployment.

## Included

- Leaflet map focused on The Battery, NOAA station **8518750** (40.7006, -74.0142).
- Server-side NOAA observation and astronomical-tide retrieval; shared five-minute cache; timeouts, coalesced requests, and explicit stale/unavailable states.
- Animated directional arrows and a six-hour, seeded particle-transport scenario with five-minute playback frames.
- Adjustable schematic current direction/speed, dispersion, release duration, and half-life; movable hypothetical source.
- Fixed-scale relative tracer density with no fabricated concentration units or health thresholds.
- Browser-local velocity JSON and lab sample CSV imports, strict size/schema validation, preserved units and censoring qualifiers.
- Downloadable scenario JSON including current particle GeoJSON, parameters, input provenance, sample records, and limitations.
- Responsive layout, keyboard-accessible controls, reduced-motion behavior, scientific explanation, and no login or database requirements.
- Bundled Leaflet and fonts; only base map tiles and NOAA data require third-party services.

## Run locally

Install Node.js 22 LTS, then:

```bash
npm ci
npm start
```

Open `http://localhost:3000`. For source watching, use `npm run dev`. No `.env` file is required; `PORT` and `HOST` are optional environment variables.

```bash
npm run check
```

The build step checks source syntax and local assets. There is no bundler or runtime npm dependency. Node's built-in HTTP server serves the frontend and the NOAA proxy.

## Endpoints

| Route | Description |
| --- | --- |
| `/` | Research map |
| `/api/health` | Render health check; application readiness independent of NOAA availability |
| `/api/station` | Battery observations, predictions, latest reading, timestamps, quality/flags, source URLs and feed status |

The server does not accept uploaded files or arbitrary external URLs. Imports are processed locally in the current browser tab. Reloading the page clears imported files. Exported scenario files may contain your imported sample data; store/share them accordingly.

## Research data contracts

See [docs/DATA-FORMATS.md](docs/DATA-FORMATS.md) and `examples/`.

The example velocity field and example lab table are **synthetic test data**. They are never loaded automatically. Their names identify them as demonstrations.

External velocities are bilinearly interpolated in space and linearly in time, within the provided grid and time range only. Coordinates are geographic WGS84 (EPSG:4326), velocities are eastward/northward in meters per second. Static masks only in version 0.1; use a later adapter for wetting/drying inundation fields.

Changing the tracer dropdown changes a label only. No organism-specific calibration is implied. The user sets the half-life. The app does not infer concentration from indicator results, tide height, or sample labels.

## Limitations that affect interpretation

1. The default velocity field and water mask are schematic, not validated harbor circulation or surveyed bathymetry. Display arrows show that configured field, never a velocity derived from the Battery's scalar water-level record.
2. The normalized hypothetical release has no measured source strength, depth, or concentration. A plotted particle represents relative tracer mass, not one organism. No infectivity is modeled.
3. Transport uses Euler stepping, Brownian dispersion, first-order decay, and illustrative boundary rejection. It omits settling, resuspension, attachment, stratification, growth, uncertainty calibration, and sewer–surface coupling. A static mask and boundary rejection can retain particles artificially; scientific deployment needs verified numerical boundary conditions and convergence testing.
4. Sample points are historical at their collection times, not automatically current. `<` and `>` qualifiers are shown as supplied. They are not substituted with zero or used to assimilate/calibrate the plume.
5. No automatic ingestion of pathogen monitoring, overflow detection, source attribution, forecast validation, conformal guarantees, environmental-justice assessment, or health-outcome analysis is included.
6. This pilot covers coastal receiving water; pluvial streets and basements require a separate coupled inundation model and observations.
7. The app does not certify water safety or establish a calibrated concentration field. A visually smooth plume is not evidence of accuracy.

## Extending toward a defensible forecast

Follow [docs/RESEARCH-ROADMAP.md](docs/RESEARCH-ROADMAP.md). The intended path is validated hydrodynamics → measured source loading → organism-specific fate → independent event validation → uncertainty calibration → operational monitoring.

## Project structure

```text
public/          Browser app, scientific model, validation, worker, styles and local vendor assets
src/noaa.mjs     NOAA API client, validation, timestamps and cache
server.mjs       Node HTTP server and response headers
test/            Transport, imported-data and feed-behavior checks
examples/        Explicitly synthetic import examples
docs/            Data contracts and research integration roadmap
scripts/         Build verification and example generation
render.yaml      Render Blueprint
START-HERE.md    Manual GitHub and Render instructions
```

## Sources and acknowledgements

- [NOAA Battery station](https://tidesandcurrents.noaa.gov/stationhome.html?id=8518750)
- [NOAA CO-OPS API](https://api.tidesandcurrents.noaa.gov/api/prod/)
- [NYC DEP Harbor Water Quality](https://www.nyc.gov/site/dep/water/harbor-water-quality.page)
- [Leaflet](https://leafletjs.com/), bundled v1.9.4; license in `public/vendor/LEAFLET-LICENSE.txt`.
- [OpenStreetMap](https://www.openstreetmap.org/copyright) data and [CARTO](https://carto.com/attributions) tiles, with map attribution retained. Review provider terms and usage limits for production traffic.
- Space Grotesk and IBM Plex Mono fonts; applicable licenses in `public/vendor/`.

The linked [coastal analyzer](https://coastalanalysis.onrender.com/) informed the dark map presentation. This is an independent application; no access to or modification of that site's repository is implied.
