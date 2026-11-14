# Scientific grounding

NASA POWER meteorological data are grid-cell reanalysis estimates, not station measurements. Native meteorological grid is 0.5° latitude × 0.625° longitude; satellite-derived solar products have different source grids. Preserve NASA returned units and source strings rather than asserting all variables share one source/grid.
https://power.larc.nasa.gov/docs/methodology/meteorology/
https://power.larc.nasa.gov/docs/methodology/data/sources/

NASA POWER parameter codes share naming conventions across temporal levels; definitions and units depend on parameter, community and temporal resolution.
https://power.larc.nasa.gov/docs/tutorials/parameters/

Reference map inspected: NASA POWER DAV uses a labeled Esri 2D geographic basemap with restrained map controls. The app will provide geographic context, not pretend its basemap is a climate heatmap.
https://power.larc.nasa.gov/data-access-viewer/

Max/Min in the app's generic series chart mean highest/lowest monthly aggregate within a year, not unobserved daily extremes. A ribbon is their within-year range, not uncertainty. Temperature maximum/minimum NASA parameter codes remain distinct variables. Annual values weight monthly aggregates by their calendar days, including leap years; missing months are inserted as missing. Main trend and extrapolation must use complete 12-month years; chart flags 10/11-month annual summaries.

Trend testing reports ordinary tie-corrected Mann–Kendall under an independent annual-observation null; report serial-dependence caveat and residual autocorrelation. Sen interval and OLS prediction interval assumptions are visible. OLS extrapolation is conditional on continued historical behavior, not a validated climate forecast or causal attribution.

Relative humidity uses RH = 100 e/e_s(T), POWER liquid-water reference. e_s depends strongly on temperature; q conversion kg/kg vs g/kg must be explicit. Physical laws are conceptual explanations, not numerical reconstructions from one monthly series.
https://power.larc.nasa.gov/docs/methodology/meteorology/relative-humidity/

Surface energy partition depends on radiation, evaporation, convection and storage; one temperature or radiation time series cannot attribute a local trend to a single process.
https://science.nasa.gov/earth/earth-observatory/climate-and-earths-energy-budget/

Water cycle couples precipitation, evaporation, runoff, infiltration and storage; rainfall alone does not quantify soil water storage or water availability.
https://gpm.nasa.gov/education/articles/nasa-earth-science-water-cycle
