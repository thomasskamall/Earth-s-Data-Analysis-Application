# EarthPulse update

- [x] Top-left selected-variable time series with four independent Mean, Max, Min and Trend line checkboxes. Display a Max–Min Ribbon when both bounds are enabled and available; name exactly what those bounds summarize.
- [x] Top-right restrained scientific 2D map inspired by NASA POWER DAV, synchronized with map clicks, city search and coordinates; show clear geographic context and data provenance.
- [x] Bottom-left scrollable Trend and prediction pane with trend magnitude/direction, significance, detected-pattern explanation, uncertainty-bearing prediction and correctly rendered equations, powers and fractions with numerical substitutions.
- [x] Bottom-right scrollable Deep analysis pane: concise, useful variable-specific scientific interpretation, underlying physical laws, uncertainty and references, without unsupported causal claims.
- [x] Keep React/Vite/TypeScript and FastAPI/Python, source export and pane controls. Reliable Windows startup and downloadable source update; preserve NASA POWER fetching and geocoding.
- [x] Read-only implementation review against the approved requirements; resolve confirmed integration/scientific defects.

Evidence: TypeScript typecheck and Vite production build pass; 24 Python tests pass; 44 physical/data-dependent KaTeX equation renderings pass. Real Cairo NASA POWER analysis passes through the Vite proxy. The read-only review found calendar-gap and weighting issues, both fixed with targeted regression tests. Windows launcher is included; not executed on a Windows machine here.
