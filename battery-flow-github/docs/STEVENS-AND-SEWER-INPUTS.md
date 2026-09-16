# Inputs needed from the model and sewer-data teams

The app already retrieves NOAA observations, historical DEP bacterial indicators, DEC outfall locations and official DEP modeled advisories. The remaining work is numerical hydrodynamic and microbial source-loading integration.

## Stevens sECOM

Please provide an accessible, authorized model-data URL or a small example NetCDF output covering the Battery / Upper New York Bay, together with:

- Model version and run/forecast-cycle identity, data-use conditions and file/endpoint documentation.
- Grid longitude/latitude, bathymetry, wet/dry masks, time coordinate with timezone/calendar, and vertical coordinates.
- Horizontal velocity fields with units; whether components are grid-aligned or geographic east/north; face/cell staggering; grid orientation angle if required.
- Selected surface layer or documented depth average, plus water levels. Salinity and temperature are useful for later microbial fate calibration.
- At least two times; preferably an event window with repeated output and its forecast-validity range.

This website is a viewer and lightweight illustrative transport application. It does not include or run the sECOM solver. A forecast screenshot, Battery tide-gauge series, or renamed output from another model is not a sECOM velocity dataset.

Once an actual file is available, inspect its dimensions and metadata, select/destagger the appropriate fields, rotate vectors if needed, and interpolate onto a masked geographic grid while checking against the original model. Do not assume native `u` and `v` are east/north, flatten a curvilinear mesh as if rectilinear, interpolate across land, or claim raw NetCDF import already exists. The resulting JSON must satisfy DATA-FORMATS.md. Scientific transport should ultimately retain an appropriate native or conservatively mapped grid and boundary conditions.

## Sewer discharge and microbial sources

For each relevant outfall or source, provide:

- An ID matching the inventory, verified coordinates and release depth.
- Discharge start/end times and hydrograph Q(t) with explicit units and observation/model provenance; distinguish measured, modeled, estimated and missing values.
- Target-specific source concentrations C(t), units, collection times, assay, detection limits, uncertainty and any source-tracking markers.
- Treatment status and overflow/bypass metadata where available.

Microbial loading is derived from compatible discharge and concentration units. An advisory duration, rainfall amount, pipe location, or zero in an undocumented volume field is not a measured loading history. No absence-of-report value should be treated as zero discharge.

For **pluvial streets/basements**, request the authorized SWMM/InfoWorks model or the pipe/manhole/regulator network, catchments, inverts, pumps, storage and operating rules, plus an overland terrain/inundation model and coupling metadata. sECOM provides the coastal receiving-water side; it does not alone resolve basement sewer backup.

## Validation before publishing pathogen predictions

Use observed currents/water levels to assess the hydrodynamics; source/event samples to calibrate loading and fate; and held-out event samples to evaluate transport and concentration errors. Only then add calibrated uncertainty or exceedance decisions. The current app makes none of those validation claims.
