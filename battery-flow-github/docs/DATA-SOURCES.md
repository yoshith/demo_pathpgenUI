# Source provenance and acquisition

Integration checked September 16, 2026. Retrieval timestamps are separate from sample dates, model validity periods, inventory edits and advisory periods.

## NOAA Battery

CO-OPS station 8518750: [station page](https://tidesandcurrents.noaa.gov/stationhome.html?id=8518750), [API documentation](https://api.tidesandcurrents.noaa.gov/api/prod/). Observations are meters relative to MLLW with UTC timestamps and source quality flags. Five-minute server cache, 12-second source timeout and explicit unavailable/stale states. Astronomical predictions are separate from observations. This is not a pathogen sensor or a velocity field.

## NYC DEP laboratory observations

[Harbor Water Quality](https://data.cityofnewyork.us/Environment/Harbor-Water-Quality/5uug-f49n), provided by NYC DEP through NYC Open Data. API: `https://data.cityofnewyork.us/resource/5uug-f49n.json`.

`src/dep.mjs` defines two reproducible bounded queries: the latest 1,500 published rows by sample date and a separate 5,000-row recent nonzero-coordinate lookup. Both exact query URLs are included in the API response and saved snapshot. The normalized export retains the most recent usable result per station, indicator and top/bottom layer in the pilot area (40.58–40.83 N, -74.12 to -73.85 E).

The source column titles identify results as **cells/100 mL**. The app preserves this and does not assume CFU or MPN. `<`, `>`, `<=`, `>=` and opaque flags such as `E` are retained. Missing/unparseable observations are excluded, not replaced with zero. The meaning of the source flag `E` has not been verified.

At acquisition, the latest dataset collection date was **2025-12-16**, despite a more recent catalog update. The packaged sample/location join yields **102 results at 43 stations**. N5 is the closest mapped station to the Battery: top enterococci **22 cells/100 mL** and fecal coliform **<1 cells/100 mL**, both collected **2025-12-01 at 9:51 as reported**. The assay and collection timezone are not supplied per result, so no timezone is invented.

Recent rows in the query lacked coordinates. N5's coordinates (40.70488, -74.02344) come from a **2022-11-02** record. Each result records whether coordinates came from that sample or a historical station lookup and gives the location record date. Some source latitude/longitude columns are reversed; a swap is allowed only when it resolves within the NYC pilot bounds. Missing/out-of-area stations are excluded transparently. Historical station positions are not guaranteed to match subsequent field positions exactly.

The service caches successful queries for six hours and retries failed refreshes after five minutes. `data/dep-snapshot.json` contains actual retrieved, normalized source results for initial outages. Its saved-snapshot status and dates remain explicit. No synthetic bacteria are substituted.

## NYS DEC sewer outfalls

[Official CSO inventory](https://data.gis.ny.gov/datasets/nysdec::combined-sewer-overflow-cso-outfalls/about), ArcGIS item `21c2ab88012444f69d20fbb1550e8937`, owned by NYS DEC.

Feature service: `https://services6.arcgis.com/DZHaqZm9cxOD4CWM/arcgis/rest/services/Combined_Sewer_Overflow__CSO__Outfalls/FeatureServer/20`.

The query selects points inside the same pilot bounds, requesting geometry in EPSG:4326 and a maximum of 2,000 records. A truncated response is rejected. Source geometry is retained without manual repositioning. The snapshot has **313 CSO locations**; the layer's data-edit timestamp was **2025-11-18T20:19:12.767Z**. A catalog item's modification date is not substituted for a field survey date.

Each point contains its outfall ID, SPDES permit and receiving water. The service explicitly gives discharge status as unknown and leaves discharge rate and microbial load null. It does not include the full underground pipe/regulator network, all SSOs, or New Jersey sources. The service refreshes daily; `data/cso-snapshot.json` is an authentic dated inventory fallback.

[NYC DEP CSO overview](https://www.nyc.gov/site/dep/water/combined-sewer-overflows.page) links management plans and annual reports. [NYS DEC Sewage Pollution Right to Know](https://dec.ny.gov/environmental-protection/water/water-quality/sewage-pollution-right-to-know) publishes reported spills and historical spreadsheets. Those reports can include estimated volumes, duplicate updates and incomplete coverage; they have not been ingested as measured per-outfall loading in this version.

## NYC DEP modeled advisory feed

[Official methodology](https://www.nyc.gov/site/dep/water/waterbody-advisories.page) links the [current DEP dashboard](https://nycwaterbodyadvisory.azurewebsites.net/). Its publicly served application uses:

- `/api/advisory?advisoryType=WQ&occurredOn=<UTC query time>`
- `/api/advisory?advisoryType=CSO&occurredOn=<UTC query time>`

Both returned **45 waterbody records** at integration. The app preserves provider messages, the duration field in hours, literal provider timestamps and product type. Its `occurredOn` response omits a UTC offset; the website displays it as reported rather than treating it as UTC or inventing local time. Retrieval time is independently recorded in UTC. The API's `volume` field is retained only in exports with its units marked unspecified; it is not used as measured sewer discharge or pathogen load.

The current production dashboard's `/api/profile` identifies the WQ geometry service as `https://services.arcgis.com/at3rDjch5X7i9Bag/arcgis/rest/services/waterbody_wq_advisory_staging/FeatureServer/0/`. Despite its service name, this is the layer linked by that production profile. The packaged boundary file retains geometry (simplified by the provider query at 0.00005 degrees), FID and trimmed name only. Its 45 FIDs and names match the 45 advisory waterbody IDs/names. No stale advisory attributes are bundled into those boundaries. It is a visualization boundary, not a hydrodynamic grid.

A ten-minute server cache and five-minute browser polling limit source requests. No current-advisory snapshot is bundled. If refresh fails, previously returned records are marked stale or the state is unavailable. A provider period older than two days is labeled outdated. “No advisory” is a provider status and does not establish safety or absence of pathogens. This API is the dashboard's public interface, not a guaranteed stable integration contract; changes may require an adapter update.

## Stevens sECOM / NYHOPS

The [Stevens forecast interface](https://hudson.dl.stevens-tech.edu/maritimeforecast/maincontrol.shtml) exposes rendered model maps. sECOM is described in the original research, including [Orton et al. (2012)](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2012JC008220), as a free-surface model on a curvilinear, staggered grid with terrain-following vertical coordinates. Native model velocities therefore need verified staggering, orientation, units, layer selection and wet-mask handling before this app can use them.

Access checks during integration:

- `https://hudson.dl.stevens-tech.edu/maritimeforecast/PRESENT/data.shtml`: HTTP 403.
- Published `http://colossus.dl.stevens-tech.edu/thredds/catalog.html`: HTTP 502.
- Forecast interface and image-generating JavaScript: accessible, but no usable numerical u/v feed obtained.

No actual sECOM field is included. No substitute model is labeled sECOM. See the required-input document for the remaining connection work.
