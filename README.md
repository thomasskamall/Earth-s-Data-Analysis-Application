# Earth's Data Analysis Application

Top-left: selected-variable time series with Mean, Max, Min and Trend line checkboxes. Top-right: labeled scientific 2D map. Bottom-left: scrollable trend, conditional prediction, uncertainty, hindcasting and mathematical calculations. Bottom-right: concise variable-specific interpretation and physical laws.

## Windows · easiest startup

Extract this ZIP to a **new folder**, then double-click `Run-Windows.bat`. It installs dependencies and opens a backend and frontend PowerShell window. Keep both open; open **http://localhost:5173** once Vite is ready. Stop old EarthPulse windows with Ctrl+C first so ports 8000 and 5173 are free.

Requires Python 3.10+ and Node 18+; Python 3.12+ and Node LTS are recommended. Internet is needed for NASA POWER, city search and basemap tiles. No NASA token or API key is required. Plain uvicorn avoids the optional PyYAML compiler issue.

## Windows · manual startup

Open PowerShell in the extracted `earthpulse` folder.

**Window 1 — backend, first setup**

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

On later runs, only `cd backend` and the uvicorn command are needed. If `py` is unavailable, create the environment with `python -m venv .venv`. No activation is required.

**Window 2 — frontend**

```powershell
cd frontend
npm.cmd install
npm.cmd run dev -- --port 5173 --strictPort
```

On later runs, installation can be skipped. Open **http://localhost:5173**, not port 8000. Backend readiness: http://127.0.0.1:8000/api/ready. A stopped backend is the usual cause of Vite `ECONNREFUSED` and proxy error 500.

## Graph controls

Mean is a centered 12-month arithmetic mean; complete windows are required. Max and Min are the highest and lowest **monthly aggregate values within each year**. Both enabled creates a Max–Min Ribbon, not a daily extreme envelope or uncertainty band. NASA's T2M_MAX and T2M_MIN codes are distinct parameter statistics. The thin monthly line and unusual-month markers are toggled from View. File exports monthly/annual CSV and chart PNG files.

## Scientific methods and limits

Annual summaries weight monthly values by the actual calendar days, including leap years. For monthly mean rates this gives a time-weighted annual rate, not a total. Extrema-derived parameters are labeled annual summaries, not annual extremes. Missing calendar months are explicitly inserted as missing and never interpolated. Display rows may contain 10–11 months, but inference uses complete 12-month years only. Ten complete years are required for trend testing; twenty for conditional extrapolation. These are app safeguards, not guarantees of statistical validity.

Trend magnitude uses SciPy Theil–Sen with a median-based separate intercept and confidence bounds. Significance uses the two-sided, tie-corrected, continuity-corrected ordinary Mann–Kendall test for independent annual observations, unadjusted for autocorrelation or multiple testing. Residual lag-1 and contiguous-year Durbin–Watson diagnostics are displayed. Significance never proves a cause.

Prediction is **conditional OLS linear extrapolation**, not a physical climate forecast. Student-t prediction intervals include future-observation residual variance and parameter uncertainty under linear, independent, constant-variance, normal-residual assumptions. They exclude reanalysis bias and future forcing changes. Expanding-window hindcasts compare with last-observed-year persistence; historical skill does not guarantee future skill. Physical-bound violations are flagged, not clipped. Intervals and slope confidence bounds use the chosen significance level α.

KaTeX renders fractions, powers and substitutions locally; Python performs full-precision calculations. Physical laws explain plausible processes but are not fitted or reconstructed from one variable.

Meteorological data are MERRA-2 grid-cell estimates (0.5° latitude × 0.625° longitude), not station readings. Radiation products have their own grids/sources. The basemap is geographic context, not a climate heatmap. In-app references and `SCIENCE-SOURCES.md` give the sources. Soil-wetness indices are not water mass; custom codes have no invented physical interpretation. NASA may reject codes unavailable at monthly resolution. GRACE, CSV upload and compare mode are not implemented.

## Source structure

`frontend/src/components/Workbench.tsx` connects settings and panes. `ScientificMap.tsx` handles Leaflet; `seriesTraces.ts` builds layers. `TrendPane.tsx` and `DeepAnalysis.tsx` display results; `Equation.tsx` renders mathematics. `frontend/src/data/science.ts` holds curated explanations. `backend/app/power.py` fetches/caches NASA data, `stats.py` calculates analysis, and `main.py` serves the API.

## Checks

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests
cd ..\frontend
npm.cmd run typecheck
npm.cmd run build
```

Linux/macOS use `.venv/bin/python`; npm commands are unchanged. The production Dockerfile serves the built frontend and API on port 3000. This ZIP does not publish the app publicly.

## Curious-mind learning mode

- Curious mind uses a colorful, friendly theme; Physicist and Geologist keep the scientific look.
- **🎬 Explain with a video** (toolbar or File menu) plays an animated, narrated data story built from the selected place and variable. **Download video** saves it as MP4/WebM with subtitles and sound effects; the narrator voice plays inside the app only.
- App font: Cairo (Google Fonts; needs internet, falls back to Segoe UI).
