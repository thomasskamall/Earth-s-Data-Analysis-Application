"""Talks to NASA POWER and remembers the answers in a small SQLite file."""
from __future__ import annotations

import calendar
import datetime as dt
import difflib
import json
import math
import os
import re
import sqlite3
import time
from pathlib import Path
from typing import Optional

import httpx

POWER_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
DAILY_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
MANAGER_URL = "https://power.larc.nasa.gov/api/system/manager/parameters"
FIRST_YEAR = 1981
CACHE_FILE = Path(os.environ.get("EARTHPULSE_CACHE", Path(__file__).resolve().parent.parent / "cache.sqlite3"))
CACHE_SECONDS = 30 * 24 * 3600
PARAM_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]{1,39}$")


class PowerError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def last_full_year() -> int:
    return dt.date.today().year - 1


def _unit(value: object) -> str:
    return "°C" if value == "C" else str(value or "")


def _manager_meta(param: str, manager: Optional[dict]) -> dict:
    return (manager or {}).get(param, {}) if isinstance(manager, dict) else {}


def parse_power(body: dict, param: str, manager: Optional[dict] = None) -> dict:
    """Turn one NASA POWER answer into our own simple shape."""
    try:
        raw = body["properties"]["parameter"][param]
    except (KeyError, TypeError):
        raise PowerError(f"NASA POWER returned no values for {param}.")
    header = body.get("header", {})
    fill = header.get("fill_value", -999)
    meta = (body.get("parameters") or {}).get(param, {})
    manager_info = _manager_meta(param, manager)
    values = []
    for key in sorted(raw):
        if len(key) >= 6 and key[4:6] == "13":
            continue
        value = raw[key]
        missing = value is None or value == fill
        try:
            value = None if missing or value is None else float(value)
        except (TypeError, ValueError):
            value = None
        values.append([f"{key[:4]}-{key[4:6]}", value])
    sources = header.get("sources") or []
    return {
        "param": param,
        "label": meta.get("longname") or manager_info.get("name") or param,
        "unit": _unit(meta.get("units") or manager_info.get("units")),
        "source": "NASA POWER" + (f" ({', '.join(sources)})" if sources else ""),
        "values": values,
        "aggregation_note": None,
    }


def _connect() -> sqlite3.Connection:
    con = sqlite3.connect(CACHE_FILE)
    con.execute("CREATE TABLE IF NOT EXISTS power (key TEXT PRIMARY KEY, fetched REAL, body TEXT)")
    con.execute("CREATE TABLE IF NOT EXISTS manager (key TEXT PRIMARY KEY, fetched REAL, body TEXT)")
    return con


def _manager_from_body(body: object) -> Optional[dict]:
    if not isinstance(body, dict):
        return None
    parameters = body.get("parameters", body)
    return parameters if isinstance(parameters, dict) else None


def get_manager() -> Optional[dict]:
    """Return the cached monthly AG manager list, using stale cache offline."""
    con = _connect()
    try:
        row = con.execute("SELECT fetched, body FROM manager WHERE key = ?", ("AG:monthly",)).fetchone()
        cached = _manager_from_body(json.loads(row[1])) if row else None
        if row and time.time() - row[0] < CACHE_SECONDS and cached is not None:
            return cached
        try:
            response = httpx.get(
                MANAGER_URL,
                params={"community": "AG", "temporal": "monthly"},
                timeout=30,
            )
            if response.status_code != 200:
                raise ValueError("manager answered with an error")
            manager = _manager_from_body(response.json())
            if manager is None:
                raise ValueError("manager returned an invalid list")
            con.execute(
                "REPLACE INTO manager VALUES (?, ?, ?)",
                ("AG:monthly", time.time(), json.dumps(manager)),
            )
            con.commit()
            return manager
        except (httpx.HTTPError, ValueError, TypeError, json.JSONDecodeError):
            return cached
    finally:
        con.close()


CATALOG_FILE = Path(__file__).resolve().parent / "catalog.json"
_catalog: Optional[dict] = None


def _load_catalog() -> dict:
    """NASA's official dictionary parameters verified to work (built by scripts/build_catalog.py)."""
    global _catalog
    if _catalog is not None:
        return _catalog
    try:
        loaded: dict = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        loaded = {"parameters": []}
    _catalog = loaded
    return loaded


def catalog_entry(param: str) -> Optional[dict]:
    return next((item for item in _load_catalog().get("parameters", []) if item["code"] == param), None)


def parameter_catalog() -> Optional[list[dict]]:
    """Return the verified official parameter list in the public /api/parameters shape."""
    items = _load_catalog().get("parameters", [])
    if not items:
        return None
    return [{**item, "availability": "daily" if item["availability"] == "daily" else availability(item["code"])} for item in items]


def catalog_summary() -> dict:
    data = _load_catalog()
    return {"dictionary_total": data.get("dictionary_total"), "skipped": data.get("skipped", {})}


def availability(param: str) -> str:
    """Classify the known service behavior for a monthly parameter."""
    code = param.upper()
    if code == "WSC":
        return "needs-options"
    if "_HR" in code:
        return "unavailable"
    if code.startswith(("GDD", "CDD", "HDD")):
        return "daily-fallback"
    return "monthly"


def _error_text(response: httpx.Response) -> str:
    try:
        body = response.json()
    except (ValueError, TypeError):
        body = None
    messages = body.get("messages") or body.get("detail") if isinstance(body, dict) else None
    if isinstance(messages, list):
        messages = "; ".join(m if isinstance(m, str) else str(m.get("msg", m)) for m in messages)
    if isinstance(messages, dict):
        messages = messages.get("msg") or messages.get("detail") or str(messages)
    return f"NASA POWER: {messages}" if messages else f"NASA POWER answered with HTTP {response.status_code}."


def _query(lat: float, lon: float, param: str, start: int, end: int) -> dict:
    return {
        "parameters": param,
        "community": "AG",
        "latitude": lat,
        "longitude": lon,
        "start": start,
        "end": end,
        "format": "JSON",
    }


def _grid_elevation(lat: float, lon: float, year: int) -> float:
    """Fetch the POWER grid elevation embedded in a small point response."""
    try:
        response = httpx.get(
            POWER_URL,
            params=_query(lat, lon, "T2M", year, year),
            timeout=30,
        )
    except httpx.HTTPError:
        raise PowerError("NASA POWER could not provide the grid elevation needed for PSC.", 503)
    if response.status_code != 200:
        raise PowerError("NASA POWER could not provide the grid elevation needed for PSC.", 502)
    try:
        elevation = response.json()["geometry"]["coordinates"][2]
        return float(elevation)
    except (KeyError, IndexError, TypeError, ValueError):
        raise PowerError("NASA POWER did not return a grid elevation needed for PSC.", 502)


def _monthly_download(lat: float, lon: float, param: str, start: int, end: int) -> tuple[dict, Optional[str]]:
    query = _query(lat, lon, param, start, end)
    try:
        response = httpx.get(POWER_URL, params=query, timeout=60)
    except httpx.HTTPError:
        raise PowerError("NASA POWER could not be reached. Check your internet connection and try again.", 503)
    if response.status_code == 200:
        return response.json(), None
    if response.status_code == 422 and param == "PSC":
        elevation = _grid_elevation(lat, lon, end)
        query["site-elevation"] = elevation
        retry = httpx.get(POWER_URL, params=query, timeout=60)
        if retry.status_code == 200:
            return retry.json(), f"NASA POWER required site-elevation; retried using the grid elevation ({elevation:g} m)."
        raise PowerError(
            f"NASA POWER still rejected PSC after the grid elevation retry: {_error_text(retry)}",
            422 if retry.status_code < 500 else 502,
        )
    if response.status_code == 422 and param == "WSC":
        raise PowerError(
            "WSC needs a chosen wind height and surface type. Try WS2M, WS10M or WS50M.",
            422,
        )
    raise PowerError(
        _error_text(response),
        422 if response.status_code < 500 else 502,
    )


def _is_accumulation(param: str, meta: dict) -> bool:
    """Sum degree-day and explicit day-count values; average other daily values."""
    code = param.upper()
    if code.startswith(("GDD", "CDD", "HDD")) or "DAYS" in code:
        return True
    text = " ".join(str(meta.get(key, "")) for key in ("name", "definition", "units")).lower()
    return "number of days" in text or "count of days" in text


def _aggregate_daily(body: dict, param: str, manager: Optional[dict], start: int, end: int) -> dict:
    try:
        raw = body["properties"]["parameter"][param]
    except (KeyError, TypeError):
        raise PowerError(f"NASA POWER has no daily version of {param}.", 502)
    header = body.get("header", {})
    fill = header.get("fill_value", -999)
    meta = _manager_meta(param, manager)
    by_month: dict[str, list[Optional[float]]] = {}
    for date_key, raw_value in raw.items():
        try:
            date = dt.datetime.strptime(str(date_key), "%Y%m%d").date()
        except ValueError:
            continue
        if not (start <= date.year <= end):
            continue
        missing = raw_value is None or raw_value == fill
        try:
            value = None if missing or raw_value is None else float(raw_value)
        except (TypeError, ValueError):
            value = None
        by_month.setdefault(f"{date.year:04d}-{date.month:02d}", []).append(value)

    values = []
    summed = _is_accumulation(param, meta)
    for year in range(start, end + 1):
        for month in range(1, 13):
            key = f"{year:04d}-{month:02d}"
            days = calendar.monthrange(year, month)[1]
            daily = by_month.get(key, [])
            valid = len(daily) == days and all(value is not None and math.isfinite(value) for value in daily)
            aggregate = None
            if valid:
                numbers = [float(value) for value in daily]  # type: ignore[arg-type]
                aggregate = sum(numbers) if summed else sum(numbers) / len(numbers)
            values.append([key, aggregate])
    sources = header.get("sources") or []
    operation = "sum of daily values" if summed else "mean of daily values"
    return {
        "param": param,
        "label": _manager_meta(param, manager).get("name") or param,
        "unit": _unit(_manager_meta(param, manager).get("units")),
        "source": "NASA POWER" + (f" ({', '.join(sources)})" if sources else ""),
        "values": values,
        "aggregation_note": (
            "Monthly values computed from NASA POWER daily data "
            f"({operation}) because NASA's monthly service fails for this parameter."
        ),
    }


def _daily_download(lat: float, lon: float, param: str, start: int, end: int, manager: Optional[dict]) -> dict:
    query = _query(lat, lon, param, int(f"{start}0101"), int(f"{end}1231"))
    try:
        response = httpx.get(DAILY_URL, params=query, timeout=60)
    except httpx.HTTPError:
        raise PowerError("NASA POWER's daily fallback could not be reached.", 503)
    if response.status_code == 200:
        return _aggregate_daily(response.json(), param, manager, start, end)
    if response.status_code == 422:
        raise PowerError(
            f"NASA POWER's monthly service fails for {param} (NASA-side error 500) and NASA has no daily version of it. "
            f"Try a supported monthly parameter instead. ({_error_text(response)})",
            502,
        )
    raise PowerError(f"NASA POWER's daily fallback failed: {_error_text(response)}", 502 if response.status_code >= 500 else 422)


def _download(lat: float, lon: float, param: str, manager: Optional[dict]) -> dict:
    entry = catalog_entry(param)
    if entry and entry.get("availability") == "daily":
        meta = {param: {"name": entry["name"], "units": entry["units"], "definition": entry["definition"]}}
        series = _daily_download(lat, lon, param, FIRST_YEAR, last_full_year(), meta)
        series["aggregation_note"] = (
            "Monthly values computed from NASA POWER daily data because NASA offers this parameter only as daily values."
        )
        return series
    last_error: Optional[PowerError] = None
    for end in (last_full_year(), last_full_year() - 1):
        try:
            body, note = _monthly_download(lat, lon, param, FIRST_YEAR, end)
            series = parse_power(body, param, manager)
            series["aggregation_note"] = note
            return series
        except PowerError as problem:
            last_error = problem
            if problem.status < 500:
                raise
            break
    if last_error is not None and "_HR" in param:
        raise PowerError(
            f"NASA POWER's monthly service fails for {param} (NASA-side error 500) and NASA has no daily version of it. "
            f"Try {param.split('_HR')[0]} instead.",
            502,
        )
    return _daily_download(lat, lon, param, FIRST_YEAR, last_full_year(), manager)


def _validate(param: str, manager: Optional[dict]) -> None:
    if manager is None or param in manager or catalog_entry(param):
        return
    suggestions = difflib.get_close_matches(param, list(manager), n=3)
    suffix = f" Did you mean {', '.join(suggestions)}?" if suggestions else ""
    raise PowerError(f"'{param}' is not a NASA POWER monthly parameter.{suffix}", 422)


def get_series(lat: float, lon: float, param: str) -> dict:
    """The full monthly record of one parameter at one place (cached)."""
    if not PARAM_PATTERN.match(param):
        raise PowerError(f"'{param}' is not a valid NASA POWER parameter code.", 422)
    manager = get_manager()
    _validate(param, manager)
    lat, lon = round(lat, 2), round(lon, 2)
    key = f"{lat:.2f},{lon:.2f},{param}"
    con = _connect()
    try:
        row = con.execute("SELECT fetched, body FROM power WHERE key = ?", (key,)).fetchone()
        if row and time.time() - row[0] < CACHE_SECONDS:
            series = json.loads(row[1])
            series.setdefault("aggregation_note", None)
        else:
            series = _download(lat, lon, param, manager)
            con.execute("REPLACE INTO power VALUES (?, ?, ?)", (key, time.time(), json.dumps(series)))
            con.commit()
    finally:
        con.close()
    return {"lat": lat, "lon": lon, **series}


def cut(series: dict, start: Optional[int], end: Optional[int]) -> dict:
    """Keep the chosen years and insert None for absent calendar months."""
    raw = {date: value for date, value in series["values"]}
    years = [int(date[:4]) for date in raw]
    first = start if start is not None else min(years) if years else None
    last = end if end is not None else max(years) if years else None
    values = [
        (f"{year}-{month:02d}", raw.get(f"{year}-{month:02d}"))
        for year in range(first, last + 1) for month in range(1, 13)
    ] if first is not None and last is not None else []
    inserted = sum(date not in raw for date, _ in values)
    present = [date for date, value in values if value is not None]
    coverage = f"{present[0]} to {present[-1]}" if present else "no data"
    return {**series, "values": values, "coverage": coverage, "months_inserted": inserted}
