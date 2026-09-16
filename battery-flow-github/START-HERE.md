# Update your GitHub / Render website

This ZIP contains the complete version 0.2 application. The default map now shows real, dated DEP lab observations with official sewer/outfall and modeled advisory layers. sECOM numerical output remains pending access.

## Your existing repository

Your repository is `yoshith/demo_pathpgenUI`, with the app inside `battery-flow-github`.

1. Download and unzip the updated `battery-flow-github.zip`.
2. In GitHub, open the existing `battery-flow-github` directory.
3. Choose **Add file → Upload files**. Upload the extracted app files and folders into that directory, replacing the previous versions. Include `public`, `src`, `data`, `scripts`, `test`, `docs`, `examples`, both package files, and `server.mjs`.
4. Commit the upload to the branch connected to Render, normally `main`.
5. Let Render auto-deploy, or choose **Manual Deploy → Deploy latest commit**.

Upload extracted files, not the ZIP. Avoid an extra nested `battery-flow-github/battery-flow-github` directory. The correct path is `battery-flow-github/package.json` in your current repository.

## Render settings

| Setting | Value for your existing layout |
| --- | --- |
| Service type / language | Web Service / Node |
| Branch | `main` |
| Root Directory | `battery-flow-github` |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Required environment variables | None |

If you instead upload the contents at the repository root, leave Root Directory blank. `package.json` must be in whichever directory Render uses as its root.

Type only **`npm start`** in the Start Command field. Render's `battery-flow-github/ $` prefix is already part of its interface.

The app binds to `0.0.0.0` and uses Render's supplied `PORT`. Use a Web Service because the data endpoints run on Node. An included `render.yaml` is also available for a new Blueprint deployment. Free services may idle between visits.

## Check your deployed page

1. **Real observations** is selected. Green lab markers show sample dates, values, units and source links. The nearest Battery station results are shown below the map.
2. Orange CSO markers show an outfall ID, permit and receiving water. Their live discharge status is **unknown**.
3. Switch between water-quality and CSO advisories. DEP advisory regions show provider dates and messages; gray/no advisory does not mean safe.
4. The NOAA card shows a timestamped water level or an unavailable/stale state.
5. Stevens sECOM says **NOT CONNECTED** until an actual compatible source is supplied. No current arrows are fabricated in this view.
6. **Explore scenario** starts the optional illustrative plume. Switch back to observations to hide it. Try layer switches and exports on desktop and mobile.

If the service reports a feed outage, the app labels any cached or saved data. It does not invent a fresh measurement.

## To connect sECOM and source loading

Send an accessible Stevens sECOM output file or model-data link, together with its grid and variable metadata. We also need outfall discharge time series and microbial source concentrations to predict pathogen movement quantitatively. [docs/STEVENS-AND-SEWER-INPUTS.md](docs/STEVENS-AND-SEWER-INPUTS.md) lists the exact inputs.

Do not populate `SECOM_FIELD_URL` with a forecast webpage or an arbitrary NetCDF URL. The optional server connector currently expects prepared velocity JSON on a Stevens HTTPS endpoint. No credentials are required for the already connected public sources.
