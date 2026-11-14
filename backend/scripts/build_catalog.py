"""Build backend/app/catalog.json from NASA POWER's official Parameter Dictionary.

The app lists only parameters that can produce a monthly time series:

* NASA's dictionary (https://power.larc.nasa.gov/parameters/) supplies names,
  keywords and tags for its official parameter set.
* The AG monthly and daily parameter managers supply units and definitions.
* "Hour-Based Parameter Set" codes (``*_HR``) are excluded: NASA's monthly
  service answers HTTP 500 for them and climatology returns no values.
* WSC is excluded: it needs a user-chosen wind height and surface type.
* Hourly-only and climatology-only parameters are excluded: they cannot form
  a monthly series from 1981 onward.
* Daily-only parameters are kept only when ``--verify`` confirms data; their
  monthly values are built from daily data by the backend.

Usage (backend running on 127.0.0.1:8000 for --verify):
    python backend/scripts/build_catalog.py --verify
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import sys
from pathlib import Path

import httpx

DICTIONARY_URL = "https://power.larc.nasa.gov/api/website/metadata/parameters?advanced=false"
MANAGER_URL = "https://power.larc.nasa.gov/api/system/manager/parameters"
OUT = Path(__file__).resolve().parents[1] / "app" / "catalog.json"
# Different climates and surfaces, so a parameter is not kept because of one lucky grid cell.
CHECK_PLACES = [(30.04, 31.24), (59.91, 10.75), (-3.10, -60.02)]
CATEGORY = {"meteorology": "Meteorology", "radiation": "Radiation", "solar": "Solar geometry"}


def manager(temporal: str) -> dict:
    response = httpx.get(MANAGER_URL, params={"community": "AG", "temporal": temporal}, timeout=60)
    response.raise_for_status()
    body = response.json()
    return body.get("parameters", body)


def candidates() -> tuple[list[dict], dict]:
    dictionary = httpx.get(DICTIONARY_URL, timeout=60).json()
    monthly, daily = manager("monthly"), manager("daily")
    kept, skipped = [], {"hour-based set (NASA monthly fails)": 0, "needs extra settings": 0,
                         "hourly or climatology only": 0}
    for item in dictionary:
        code = item["id"]
        if "_HR" in code:
            skipped["hour-based set (NASA monthly fails)"] += 1
            continue
        if code == "WSC":
            skipped["needs extra settings"] += 1
            continue
        if code in monthly:
            source, meta = "monthly", monthly[code]
        elif code in daily and "daily" in item.get("availability", []):
            source, meta = "daily", daily[code]
        else:
            skipped["hourly or climatology only"] += 1
            continue
        tags = item.get("tags", [])
        category = next((CATEGORY[t] for t in tags if t in CATEGORY), "Meteorology")
        since = (item.get("range") or {}).get("start", "")[:4]
        kept.append({
            "code": code,
            "name": item.get("name") or meta.get("name") or code,
            "units": meta.get("units") or "",
            "definition": meta.get("definition") or "",
            "type": category,
            "availability": source,
            "keywords": [k for k in item.get("keywords", []) if isinstance(k, str)][:12],
            "official": "official" in tags,
            "nrt": "nrt" in tags,
            "reviewing": "reviewing" in tags or "warning" in tags,
            "since": int(since) if since.isdigit() else None,
            "rank": item.get("rank") or 0,
        })
    return kept, {"dictionary_total": len(dictionary), "skipped": skipped}


def works(code: str, base: str) -> bool:
    """True when the app's own analysis succeeds with real data at any check place."""
    for lat, lon in CHECK_PLACES:
        try:
            response = httpx.get(f"{base}/api/analysis", timeout=300, params={
                "lat": lat, "lon": lon, "param": code, "start": 1981, "end": 2025,
                "alpha": 0.05, "horizon": 5,
            })
        except httpx.HTTPError:
            continue
        if response.status_code == 200:
            body = response.json()
            coverage = body.get("data_coverage") or {}
            trend_ok = (body.get("trend_availability") or {}).get("available")
            if trend_ok and coverage.get("n_valid_months", 0) >= 36:
                return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true", help="test each parameter through the running backend")
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    kept, report = candidates()
    if args.verify:
        with cf.ThreadPoolExecutor(8) as pool:
            ok = list(pool.map(lambda item: works(item["code"], args.base), kept))
        failed = [item["code"] for item, good in zip(kept, ok) if not good]
        kept = [item for item, good in zip(kept, ok) if good]
        report["skipped"]["no usable data from NASA"] = len(failed)
        report["failed_codes"] = failed
    kept.sort(key=lambda item: (-float(item["rank"]), item["name"].lower()))
    for item in kept:
        item.pop("rank", None)
    OUT.write_text(json.dumps({"source": DICTIONARY_URL, **report, "parameters": kept}, indent=1) + "\n")
    print(json.dumps({**report, "kept": len(kept)}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
