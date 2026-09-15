# Put Battery Flow on GitHub and Render

This folder is the complete website. No NOAA API key is needed.

## 1. Upload to GitHub

1. Unzip `battery-flow-github.zip` on your computer.
2. Create a new GitHub repository, for example `battery-flow`.
3. Choose **uploading an existing file** (or **Add file → Upload files**).
4. Drag the extracted files AND folders into the upload window.
5. Commit the upload.

**Upload the extracted contents, not the ZIP.** At the top level of the repository you must see `package.json`, `server.mjs`, `render.yaml`, and `public/`. Do not put everything inside an extra parent folder. Files in `public/vendor/` must be included.

## 2. Deploy on Render

1. In Render, choose **New → Web Service** and connect your GitHub repository.
2. Select the branch you uploaded, usually `main`.
3. Use these settings:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root directory | Leave blank if `package.json` is at repository root |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Render supplies `PORT`; the server binds to `0.0.0.0`. No environment secrets are required. Alternatively, create a Render Blueprint from the included `render.yaml`; review Render's plan and pricing before deploying.

Use a **Web Service**, because `/api/station` runs on the server. A Static Site or GitHub Pages alone will not run the NOAA proxy.

The included blueprint chooses a free service. Free instances can idle and take time to start again, so they are suitable for a demonstration rather than a continuously available monitoring service. For dependable availability, select an appropriate always-on service.

If you are replacing an existing Render app, its connected repository and service settings must point to these files. This ZIP does not modify the existing sea-level analyzer automatically.

## What is live and what is simulated?

- **Live when the feed is available:** NOAA Battery water-level observations, with timestamps and status. NOAA may return preliminary or flagged observations.
- **Predicted by NOAA:** Astronomical tide levels. These are not complete storm-surge predictions.
- **Simulated:** Flow arrows and relative microbial tracer density, unless an external velocity field is imported. Imported flow still drives an uncalibrated tracer release.
- **Not included:** Live detection of all pathogens, validated pathogen concentrations, a pluvial/basement flood model, or public-health safety declarations.

Open **Data & limits** in the app for these distinctions.

## Check that it works

Open the Render URL. The map should show the Battery and a hypothetical harbor release. Move the timeline, click Play, change a parameter and click Update scenario. The NOAA card shows water levels if NOAA is reachable. If NOAA is down, it displays unavailable/stale status instead of invented values.

## What you can send later to make this scientifically useful

1. Your professor's hydrodynamic output: time, longitude/latitude, eastward/northward velocity, coordinate system, units, wet/dry mask, and model provenance. NetCDF outputs need a model-specific conversion to the documented JSON format.
2. Laboratory data: target organism, coordinates, collection timestamp, result, units, assay method, and detection-limit qualifier.
3. Documented source locations, discharge/load histories, and organism-specific fate parameters.
4. Independent event samples for validation and uncertainty assessment.

Do not send passwords or private account keys. These research inputs are not needed to launch the demonstration.

Official deployment guide: https://render.com/docs/deploy-node-express-app
