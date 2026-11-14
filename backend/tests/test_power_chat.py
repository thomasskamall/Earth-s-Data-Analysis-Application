import json
from pathlib import Path

from fastapi.testclient import TestClient

from app import chat, power
from app.main import app


client = TestClient(app)


class FakeResponse:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self._body = body

    def json(self):
        return self._body


def manager_fixture():
    return {
        "GDD10": {"name": "Growing degree days", "units": "C day", "definition": "Degree days", "type": "climatology"},
        "PRECTOTCORR": {"name": "Precipitation", "units": "mm", "definition": "Precipitation", "type": "climatology"},
        "PSC": {"name": "Surface pressure corrected", "units": "kPa", "definition": "Pressure", "type": "climatology"},
        "WSC": {"name": "Wind speed correction", "units": "", "definition": "Wind", "type": "climatology"},
        "T2M": {"name": "Temperature at 2 meters", "units": "C", "definition": "Air temperature", "type": "climatology"},
        "T2MWET": {"name": "Wet-bulb temperature", "units": "C", "definition": "Temperature", "type": "climatology"},
        "T2MDEW": {"name": "Dew point temperature", "units": "C", "definition": "Temperature", "type": "climatology"},
    }


def daily_body(param, values):
    return {
        "header": {"fill_value": -999, "sources": ["MERRA2"]},
        "properties": {"parameter": {param: values}},
    }


def test_daily_fallback_sums_and_means_and_marks_incomplete(monkeypatch, tmp_path):
    monkeypatch.setattr(power, "CACHE_FILE", tmp_path / "cache.sqlite3")
    monkeypatch.setattr(power, "get_manager", lambda: manager_fixture())
    calls = []

    def fake_get(url, params=None, timeout=None):
        calls.append((url, params))
        if url == power.POWER_URL:
            return FakeResponse(500, {"messages": ["server failure"]})
        if params["parameters"] == "GDD10":
            values = {"19810101": 1, "19810102": 2, "19810103": 3}
            return FakeResponse(200, daily_body("GDD10", values))
        values = {"19810101": 10, "19810102": 20, "19810103": -999}
        return FakeResponse(200, daily_body("PRECTOTCORR", values))

    monkeypatch.setattr(power.httpx, "get", fake_get)
    gdd = power.get_series(0, 0, "GDD10")
    rain = power.get_series(0, 0, "PRECTOTCORR")
    assert gdd["values"][0] == ["1981-01", None]  # every day in month is required
    assert "sum of daily values" in gdd["aggregation_note"]
    assert rain["values"][0] == ["1981-01", None]
    assert "mean of daily values" in rain["aggregation_note"]
    assert any(url == power.DAILY_URL for url, _ in calls)


def test_daily_fallback_sum_on_complete_short_month(monkeypatch, tmp_path):
    monkeypatch.setattr(power, "CACHE_FILE", tmp_path / "cache.sqlite3")
    manager = {"GDD10": {"name": "Growing degree days", "units": "C day"}}
    monkeypatch.setattr(power, "get_manager", lambda: manager)
    def fake_get(url, params=None, timeout=None):
        if url == power.POWER_URL:
            return FakeResponse(500, {})
        values = {f"198102{day:02d}": day for day in range(1, 29)}
        return FakeResponse(200, daily_body("GDD10", values))
    monkeypatch.setattr(power.httpx, "get", fake_get)
    series = power.get_series(0, 0, "GDD10")
    assert series["values"][1] == ["1981-02", sum(range(1, 29))]


def test_unknown_code_suggestions(monkeypatch):
    monkeypatch.setattr(power, "get_manager", lambda: manager_fixture())
    error = None
    try:
        power.get_series(0, 0, "T2MX")
    except power.PowerError as problem:
        error = problem
    assert error is not None and error.status == 422
    assert "Did you mean" in str(error)
    assert "T2M" in str(error)


def test_psc_retries_with_grid_elevation(monkeypatch, tmp_path):
    monkeypatch.setattr(power, "CACHE_FILE", tmp_path / "cache.sqlite3")
    monkeypatch.setattr(power, "get_manager", lambda: {"PSC": {"name": "Pressure", "units": "kPa"}})
    seen = []
    def fake_get(url, params=None, timeout=None):
        seen.append((url, dict(params)))
        if params["parameters"] == "T2M":
            return FakeResponse(200, {"geometry": {"coordinates": [0, 0, 123.4]}})
        if "site-elevation" not in params:
            return FakeResponse(422, {"detail": "Please provide a site elevation"})
        return FakeResponse(200, {"header": {}, "parameters": {"PSC": {"units": "kPa"}}, "properties": {"parameter": {"PSC": {"198101": 100}}}})
    monkeypatch.setattr(power.httpx, "get", fake_get)
    result = power.get_series(0, 0, "PSC")
    assert result["values"][0] == ["1981-01", 100.0]
    assert result["aggregation_note"] and "123.4" in result["aggregation_note"]
    assert any("site-elevation" in params for _, params in seen)


def test_parameters_list_is_verified_official_catalog():
    response = client.get("/api/parameters")
    assert response.status_code == 200
    items = response.json()
    codes = [item["code"] for item in items]
    assert 200 <= len(items) <= 368
    assert len(codes) == len(set(codes))
    assert {"T2M", "PRECTOTCORR", "RH2M", "ALLSKY_SFC_SW_DWN", "WS10M"} <= set(codes)
    assert not [code for code in codes if "_HR" in code or code == "WSC"]
    assert {"code", "name", "units", "definition", "type", "availability"} <= set(items[0])
    assert codes[0] == "T2M"  # NASA's own popularity order is kept


def test_daily_only_catalog_code_is_accepted():
    assert power.catalog_entry("SZA")["availability"] == "daily"
    power._validate("SZA", {"T2M": {}})


def test_chat_validation_and_offline_fact_answer(monkeypatch):
    monkeypatch.delenv("CHAT_API_KEY", raising=False)
    monkeypatch.delenv("MANUS_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    response = client.post("/api/chat", json={"messages": [{"role": "user", "content": "Is the trend significant?"}], "context": {"unit": "mm", "facts": {"p_value": 0.01, "alpha": 0.05}}})
    assert response.status_code == 200
    assert response.json()["mode"] == "offline"
    assert "statistically significant" in response.json()["reply"]
    bad = client.post("/api/chat", json={"messages": [{"role": "assistant", "content": "hello"}]})
    assert bad.status_code == 422


def test_chat_provider_resolution_and_dotenv(monkeypatch, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("CHAT_API_KEY='dotenv-key'\nCHAT_BASE_URL=https://chat.example/v1\nCHAT_MODEL=terra\n", encoding="utf-8")
    monkeypatch.setattr(chat, "ENV_PATH", env_file)
    for key in ("CHAT_API_KEY", "CHAT_BASE_URL", "CHAT_MODEL", "MANUS_API_KEY", "MANUS_API_URL", "OPENAI_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    provider = chat._resolve_provider()
    assert provider == {"key": "dotenv-key", "url": "https://chat.example/v1/chat/completions", "model": "terra"}
    monkeypatch.setenv("MANUS_API_KEY", "manus-key")
    monkeypatch.setenv("MANUS_API_URL", "https://manus.example")
    monkeypatch.setenv("CHAT_API_KEY", "chat-key")
    assert chat._resolve_provider()["key"] == "chat-key"


def test_chat_provider_empty_response_falls_back(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "key")
    monkeypatch.delenv("CHAT_API_KEY", raising=False)
    monkeypatch.delenv("CHAT_BASE_URL", raising=False)
    monkeypatch.delenv("MANUS_API_KEY", raising=False)
    monkeypatch.delenv("MANUS_API_URL", raising=False)
    monkeypatch.setattr(chat.httpx, "post", lambda *args, **kwargs: FakeResponse(200, {"choices": []}))
    response = client.post("/api/chat", json={"messages": [{"role": "user", "content": "What is wind?"}]})
    assert response.status_code == 200
    assert response.json()["mode"] == "offline"
    assert "Wind speed" in response.json()["reply"]
