"""Earth's Data Analysis Application backend. Start it with:  uvicorn app.main:app --reload"""
from __future__ import annotations

from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Query

from . import chat, power, stats

app = FastAPI(title="Earth's Data Analysis Application API")

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"


def _series(lat: float, lon: float, param: str, start: Optional[int], end: Optional[int]) -> dict:
    if start is not None and end is not None and start > end:
        raise HTTPException(422, "The start year must not be after the end year.")
    for year in (start, end):
        if year is not None and not power.FIRST_YEAR <= year <= power.last_full_year():
            raise HTTPException(422, f"Choose a year from {power.FIRST_YEAR} to {power.last_full_year()}.")
    try:
        return power.cut(power.get_series(lat, lon, param.upper()), start, end)
    except power.PowerError as problem:
        raise HTTPException(problem.status, str(problem))


@app.get("/api/data")
def data(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    param: str = "T2M",
    start: Optional[int] = None,
    end: Optional[int] = None,
):
    series = _series(lat, lon, param, start, end)
    series["values"] = [{"date": d, "value": v} for d, v in series["values"]]
    return series


@app.get("/api/analysis")
def analysis(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    param: str = "T2M",
    start: Optional[int] = None,
    end: Optional[int] = None,
    alpha: float = Query(0.05, gt=0, lt=1),
    horizon: int = Query(5, ge=1, le=10),
):
    series = _series(lat, lon, param, start, end)
    values = series.pop("values")
    calculated = stats.analyse(values, alpha, param=param.upper(), horizon=horizon)
    calculated["data_coverage"] = calculated.pop("coverage")
    return {**series, **calculated}


@app.get("/api/city")
def city(name: str = Query(min_length=2)):
    try:
        response = httpx.get(GEOCODE_URL, params={"name": name, "count": 8, "language": "en"}, timeout=20)
        response.raise_for_status()
    except httpx.HTTPError:
        raise HTTPException(503, "The city search service (Open-Meteo) could not be reached.")
    return [
        {
            "name": r["name"],
            "region": ", ".join(p for p in (r.get("admin1"), r.get("country")) if p),
            "lat": r["latitude"],
            "lon": r["longitude"],
        }
        for r in response.json().get("results", [])
    ]


@app.get("/api/parameters")
def parameters():
    catalog = power.parameter_catalog()
    if catalog is None:
        raise HTTPException(503, "The NASA parameter list file (backend/app/catalog.json) is missing.")
    return catalog


@app.get("/api/parameters/summary")
def parameters_summary():
    return power.catalog_summary()


@app.post("/api/chat", response_model=chat.ChatResponse)
def chat_endpoint(request: chat.ChatRequest):
    return chat.answer(request)


@app.get("/api/health")
def health():
    def check(url: str, params: dict) -> dict:
        try:
            ok = httpx.get(url, params=params, timeout=20).status_code == 200
            return {"ok": ok, "detail": "reachable" if ok else "answered with an error"}
        except httpx.HTTPError:
            return {"ok": False, "detail": "could not be reached"}

    return {
        "NASA POWER": check(power.POWER_URL, {
            "parameters": "T2M", "community": "AG", "latitude": 0, "longitude": 0,
            "start": 2020, "end": 2020, "format": "JSON",
        }),
        "Open-Meteo geocoding": check(GEOCODE_URL, {"name": "Cairo", "count": 1}),
        "GRACE (Earthdata)": {"ok": False, "detail": "not connected yet (step 4)"},
    }


@app.get("/api/ready")
def ready():
    """Local readiness does not wait for external NASA services."""
    return {"ok": True, "version": "four-pane-scientific"}


# A production build can be served by FastAPI; local development still uses Vite.
from pathlib import Path
from fastapi.staticfiles import StaticFiles

_frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
