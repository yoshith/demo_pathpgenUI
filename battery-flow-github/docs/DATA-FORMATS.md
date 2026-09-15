# Data formats, version 1

## Hydrodynamic velocity field

Choose **Import data → Choose velocity JSON**. Files are read into memory in the browser; there is no server upload. Maximum 12 MB, 6,000 grid cells, 145 time steps, 400,000 total cell-times and 72 hours. At least five minutes of temporal coverage is needed for playback.

```json
{
  "schemaVersion": 1,
  "kind": "hydrodynamic-field",
  "name": "Example field name",
  "provenance": "Model, version, run, forcing, vertical layer, and validation reference",
  "crs": "EPSG:4326",
  "velocityUnits": "m/s",
  "times": ["2026-01-01T00:00:00Z", "2026-01-01T06:00:00Z"],
  "grid": {
    "longitude": [-74.03, -74.02],
    "latitude": [40.695, 40.705],
    "wetMask": [1, 1, 1, 1]
  },
  "u": [[0.05, 0.05, 0.05, 0.05], [0.05, 0.05, 0.05, 0.05]],
  "v": [[-0.2, -0.2, -0.2, -0.2], [-0.2, -0.2, -0.2, -0.2]]
}
```

- Longitude and latitude must increase strictly and remain inside this pilot's bounding box: longitude -74.12 to -73.85, latitude 40.58 to 40.83. These are application bounds, not a scientific flood boundary.
- `u` means velocity **toward east**, `v` means velocity **toward north**; m/s, not cm/s, knots, model-grid axes, or a direction-from bearing.
- Flatten each `[latitude, longitude]` array with **longitude changing fastest**. Index = latitude_index × longitude_count + longitude_index.
- `wetMask` has one 1 (wet) or 0 (dry) per grid node. Cells requiring a dry interpolation corner are unavailable. Use 0 for velocities in dry nodes; NaN, Infinity, null and strings are rejected.
- Current grids must already be converted to a regular geographic coordinate grid. Unstructured ADCIRC, sECOM or Delft3D meshes, projected coordinates and NetCDF files require a model-specific preprocessing adapter. Rotation and staggering of velocities must be resolved correctly before export.
- No spatial or temporal extrapolation is used. Playback stops at the lesser of six hours or available data (rounded down to five minutes).
- A static wet mask cannot represent pluvial wetting/drying. The importer is for a small coastal pilot and does not automatically make the transport scientifically accurate.
- The app assigns `validationStatus: Not verified by this application` regardless of any supplied claim.

## Laboratory samples

Choose **Import data → Choose samples CSV**. Maximum 2 MB / 2,000 rows.

```csv
id,latitude,longitude,collected_at,target,value,unit,qualifier,method
EXAMPLE-ONLY-01,40.700,-74.025,2026-01-01T12:00:00Z,Enterococcus indicator,12,MPN/100 mL,<,Synthetic test row
```

Required fields are `id`, `latitude`, `longitude`, `collected_at`, `target`, `value`, `unit`, and `qualifier`. `method` is optional but scientifically important. IDs must be unique. Times must be ISO-8601 UTC strings ending in `Z`. Coordinates must lie within the pilot bounds above.

The `value` must be numeric and nonnegative. The `qualifier` is `=` (reported value), `<` (below the supplied reporting limit), or `>` (above the supplied assay limit). For a nondetect, put the detection/reporting limit in value and `<` in qualifier; do not enter zero unless zero is the actual reported value with an appropriate meaning.

Different organisms and units remain separate in popups; no inappropriate pooling or conversions occur. CSV quotes and commas in quoted fields are supported. Values are escaped before presentation.

## Scenario export

**Export scenario** downloads a JSON file with settings, scientific status, the selected frame's particles as a GeoJSON FeatureCollection, relative mass, source/model provenance, a NOAA snapshot and imported samples. The export is a scenario record, not a hydrodynamic-field import file. Keep the original model file separately to reproduce an imported-flow scenario. Random particle generation uses a fixed seed for repeatability.
