# Battery Flow

NYC Battery research map with actual NOAA water levels, published DEP bacterial indicators, official DEC CSO outfall locations, and DEP's own modeled waterbody advisories. Version 0.2 preserves the dark map interface and makes observations the default view.

**This is not live detection of all pathogens. Stevens sECOM numerical output is not connected by default.** The optional tracer scenario remains uncalibrated.

See [START-HERE.md](START-HERE.md) for updating your existing GitHub repository and Render service.

## Data included

| Layer | Source | What it represents |
| --- | --- | --- |
| Battery tide gauge | NOAA CO-OPS, station 8518750 | Timestamped water-level observations and astronomical tide predictions |
| Enterococci and fecal coliform | NYC DEP Harbor Water Quality, dataset `5uug-f49n` | Dated lab results, with native units and detection-limit qualifiers |
| CSO outfalls | NYS DEC official GIS inventory | Outfall coordinates, permit numbers and receiving waters; discharge status unknown |
| Waterbody / CSO advisories | Current NYC DEP dashboard API | Official rainfall/model-based advisories, not direct bacterial or discharge measurements |
| sECOM currents | Awaiting accessible Stevens numerical output | No fake numerical field is substituted |
| Optional tracer scenario | This application's illustrative transport code | Relative tracer mass; no calibrated concentration or infectivity |

On September 16, 2026, the DEP query returned a latest collection date of December 16, 2025. The packaged lookup contains 102 latest indicator/layer results at 43 stations within the pilot bounds. The nearest mapped station to the Battery, N5, has top-sample results from December 1, 2025. Its coordinates come from a November 2, 2022 station record and are explicitly identified as historical.

The CSO snapshot contains 313 outfall locations in the pilot bounds, with the source layer's data-edit timestamp of November 18, 2025. The advisory API returned 45 waterbody records for each of its WQ and CSO products. These are source-specific counts, not evidence of full monitoring coverage.

See [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) for exact provenance, refresh behavior and limitations.

## Run

Use Node.js 22, then:

```bash
npm ci
npm start
```

Open `http://localhost:3000`. `npm run dev` watches source changes. `npm run check` verifies source syntax, assets, and meaningful data/transport behavior. There is no frontend bundler or runtime npm dependency.

Render supplies `PORT`. No API key or database is required for the connected public sources.

## Server endpoints

| Route | Description |
| --- | --- |
| `/api/health` | Application readiness, independent of upstream data availability |
| `/api/station` | NOAA readings, predictions, timestamps and quality flags |
| `/api/observations` | DEP laboratory results and sample/location provenance |
| `/api/sewers` | DEC outfall GeoJSON inventory; no inferred discharge |
| `/api/advisories` | Official DEP WQ and CSO advisory records and feed status |
| `/api/stevens` | sECOM connection status; configured numerical data only when available |

The browser contacts this server for feeds. The server uses fixed public data endpoints, bounded responses, caches and timeouts. It exposes no arbitrary URL proxy. Local JSON/CSV imports stay in the browser tab. Observation and sewer/advisory exports retain source dates and provenance.

Authentic historical DEP and outfall snapshots are packaged for source outages. They are labeled saved snapshots and keep their original dates. Advisory status has no packaged fallback: a failure is unknown, or stale if a prior response remains cached.

## Stevens sECOM

The requested model is **Stevens Estuarine and Coastal Ocean Model (sECOM)**. NYHOPS is an application/forecast system using Stevens hydrodynamics; its graphics do not supply a numerical transport field by themselves.

The publicly linked data page returned HTTP 403 and the published Colossus THREDDS catalog returned HTTP 502 during this integration. No actual sECOM velocity field, source code, executable, grid or calibrated microbial module has been acquired. The app does not run sECOM on Render.

An accessible provider-approved output or endpoint is needed. See [docs/STEVENS-AND-SEWER-INPUTS.md](docs/STEVENS-AND-SEWER-INPUTS.md). Native sECOM outputs require a source-specific adapter; the app currently accepts prepared east/north velocity JSON, not arbitrary NetCDF files.

Only after a suitable Stevens-hosted JSON feed exists, set `SECOM_FIELD_URL` in Render. It must be HTTPS on a Stevens domain, obey [docs/DATA-FORMATS.md](docs/DATA-FORMATS.md), and declare `modelFamily: "sECOM"` with provenance. That declaration is not scientific validation. Browser-local velocity imports also remain available.

## Scientific limitations

- Indicator samples are historical observations at stations. They do not reveal today's concentrations between stations or the presence of every pathogen. No CFU/MPN conversion is assumed for DEP's published `cells/100 mL` fields.
- Recent DEP rows lack coordinates. A bounded historical station lookup is used and dated. Unmatched and out-of-area records are excluded. Exported data explains the lookup.
- Outfall locations are potential sources. Neither inventory points nor DEP advisory products provide calibrated per-outfall discharge hydrographs or microbial loads. New Jersey outfalls, full sewer pipes/regulators and pluvial inundation are not included.
- An official advisory is a model-based agency product. No advisory is not a declaration of safe water. The app preserves the provider's timezone-unspecified timestamps without inventing a timezone.
- The optional scenario uses schematic flow unless a prepared external field is loaded. Transport uses Euler stepping, Brownian dispersion, first-order decay and illustrative boundary rejection. Its static mask, hypothetical source and biological parameters need independent verification before scientific use.
- Imported velocities are interpolated only inside their grid/time coverage. Model accuracy, concentration calibration, uncertainty bounds, environmental-justice coverage and health outcomes have not been validated.

## Project layout

- `public/`: frontend, worker, illustrative transport, import validation, reference waterbody boundaries, bundled Leaflet and fonts.
- `src/`: NOAA, DEP, sECOM connection and sewer/advisory clients.
- `data/`: authentic dated DEP and DEC inventory fallback snapshots.
- `test/`: feed behavior, provenance, missing-data and transport checks.
- `examples/`: explicitly synthetic velocity/sample import fixtures; never auto-loaded.
- `docs/`: sources, data contracts, validation limits and required research inputs.

## Attribution

[NOAA CO-OPS](https://api.tidesandcurrents.noaa.gov/api/prod/), [NYC DEP Harbor Water Quality](https://www.nyc.gov/site/dep/water/harbor-water-quality.page), [NYS DEC CSO inventory](https://data.gis.ny.gov/datasets/nysdec::combined-sewer-overflow-cso-outfalls/about), [NYC DEP advisories](https://www.nyc.gov/site/dep/water/waterbody-advisories.page), and [Stevens / NYHOPS](https://hudson.dl.stevens-tech.edu/maritimeforecast/maincontrol.shtml).

Leaflet 1.9.4 and fonts are bundled with their licenses. Base map data is attributed to OpenStreetMap and CARTO in the map. The linked coastal analyzer inspired the visual presentation; this app does not modify that site's repository.
