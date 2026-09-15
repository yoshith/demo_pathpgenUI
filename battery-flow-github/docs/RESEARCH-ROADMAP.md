# Moving from this prototype to scientific prediction

The current package intentionally separates observed gauge data, hypothetical tracer transport, and imported observations. It provides a UI and small integration contract, not the validated scientific stack.

## Inputs to request from the professor

1. Existing hydrodynamic model and license/access: model name and version, mesh, coordinate/vertical systems, bathymetry, velocities and levels, output cadence, and wetting/drying behavior.
2. A short, well-documented Battery/Upper Harbor event output plus its independent hydraulic validation. Include velocity component direction, units, grid rotation/staggering, missing-value flags and masks.
3. Target organisms and feasible laboratory assays. Enterococcus is an indicator; it cannot automatically stand in for every pathogen.
4. Point/diffuse source locations, discharge histories and measured or defensible microbial load distributions.
5. Independent microbial samples spanning source, transport and recession phases, including method, detection limits and controls.
6. Whether the intended pathway is coastal receiving water, on-land pluvial floodwater, or both. The latter needs sewer/surface model coupling and separate validation.

## Integration sequence

1. Replace the schematic current field with a checked provider-specific converter. The importer can visualize regular gridded results, but scientific transport should use the validated solver's native grid and boundary conditions where possible.
2. Use a conservative fate-and-transport implementation with organism-specific processes and explicit mass fluxes. Keep source/load uncertainty separate from velocity and parameter uncertainty.
3. Validate hydrodynamics first; then validate transport and microbial fate on held-out complete events and sites. Test units, grids, masks, times, mass balance and numerical convergence.
4. Treat laboratory censoring with an appropriate likelihood. Preserve collection time versus result-availability time so a nowcast does not use future information.
5. Add posterior/ensemble predictions and a documented calibration procedure. Event dependence and distribution shift constrain any coverage or missed-exceedance guarantee. The current UI has no confidence percentages because none have been established.
6. Only then add forecast labels, model provenance, monitored operating limits, appropriate thresholds and operational alerts agreed with domain partners.

## App work after scientific validation

- Scheduled model runs and versioned forecast storage.
- Provider adapters for NOAA/NYHOPS or the professor's model outputs, with schema and provenance checks.
- Time-varying wet masks, depth and land-surface deposition for pluvial extensions.
- Documented source catalogs and lab data ingestion/assimilation.
- Uncertainty layers and observation-versus-prediction comparison.
- Model status and outage monitoring, credential handling if needed, data retention/access policies, and sufficient hosting capacity.

No amount of map animation establishes live detection or scientific accuracy. Accuracy must be measured against independent pathogen observations for each endpoint and use case.
