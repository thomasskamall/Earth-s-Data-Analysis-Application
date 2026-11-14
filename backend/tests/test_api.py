import math
from fastapi.testclient import TestClient
from app.main import app
from app import power

client = TestClient(app)

def test_ready_is_local_and_reports_updated_backend():
    response = client.get('/api/ready')
    assert response.status_code == 200
    assert response.json()['version'] == 'four-pane-scientific'

def test_api_preserves_string_coverage_and_prediction_contract(monkeypatch):
    values = [[f'{year}-{month:02d}', 20 + 0.02 * (year - 1981) + math.sin(month)] for year in range(1981, 2026) for month in range(1, 13)]
    monkeypatch.setattr(power, 'get_series', lambda lat, lon, param: dict(lat=lat, lon=lon, param=param, label='Temperature', unit='°C', source='NASA POWER (test fixture)', values=values))
    response = client.get('/api/analysis', params=dict(lat=30.04, lon=31.24, param='T2M', start=1981, end=2025, alpha=0.01, horizon=3))
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body['coverage'], str)
    assert body['data_coverage']['n_complete_years'] == 45
    assert body['prediction']['confidence_level'] == 0.99
    assert len(body['prediction']['years']) == 3
    assert body['trend']['n_years'] == 45

def test_invalid_horizon_or_coordinates_rejected():
    assert client.get('/api/analysis?lat=0&lon=0&horizon=20').status_code == 422
    assert client.get('/api/analysis?lat=100&lon=0').status_code == 422

def test_reversed_period_rejected_before_network():
    assert client.get('/api/analysis?lat=0&lon=0&start=2025&end=1981').status_code == 422
