import math
import json

import numpy as np

from app import power, stats


def make(first_year, years, fn) -> list[tuple[str, float | None]]:
    return [(f"{y}-{m:02d}", fn(y, m)) for y in range(first_year, first_year + years) for m in range(1, 13)]


def test_annual_means_skip_incomplete_years():
    monthly = make(2000, 2, lambda y, m: 10.0)
    monthly += [("2002-01", 5.0), ("2002-02", 5.0)]          # only 2 months
    monthly[3] = (monthly[3][0], None)                        # 11 months left in 2000
    assert [y for y, _ in stats.annual_means(monthly)] == [2000, 2001]


def test_annual_rows_include_monthly_extrema_and_completeness_flags():
    monthly = make(2000, 1, lambda y, m: float(m))
    monthly += [(f"2001-{month:02d}", float(month)) for month in range(1, 11)]
    annual = stats.analyse(monthly)["annual"]
    assert annual[0]["n_months"] == 12
    assert annual[0]["min"] == 1.0 and annual[0]["max"] == 12.0
    assert annual[0]["complete"] is True
    assert annual[1]["n_months"] == 10
    assert annual[1]["min"] == 1.0 and annual[1]["max"] == 10.0
    assert annual[1]["complete_12_months"] is False


def test_climatology_recovers_the_seasonal_cycle():
    monthly = make(1990, 20, lambda y, m: 20 + 5 * math.sin(2 * math.pi * m / 12))
    clim = stats.climatology(monthly)
    assert len(clim) == 12
    assert abs(clim[2]["mean"] - 25.0) < 1e-9                 # March is the peak
    assert clim[0]["n"] == 20


def test_running_mean_is_none_at_the_edges_and_flat_inside():
    monthly = make(2000, 3, lambda y, m: 7.0)
    running = stats.running_mean(monthly)
    assert running[0] is None and running[-1] is None
    assert running[18] == 7.0


def test_trend_finds_a_known_slope_and_calls_it_significant():
    rng = np.random.default_rng(1)
    years = list(range(1981, 2026))
    values = [15 + 0.03 * (y - 1981) + rng.normal(0, 0.2) for y in years]
    t = stats.trend(years, values)
    assert t is not None
    assert abs(t["sen_slope"] - 0.03) < 0.005
    assert abs(t["change_per_decade"] - 0.3) < 0.05
    assert t["sen_slope_low"] < 0.03 < t["sen_slope_high"]
    assert t["significant"] and t["mk_p"] < 0.001
    assert t["r_squared"] > 0.7


def test_noise_is_not_significant():
    rng = np.random.default_rng(7)
    years = list(range(1981, 2026))
    t = stats.trend(years, list(rng.normal(50, 3, len(years))))
    assert t is not None
    assert not t["significant"]


def test_constant_series_has_no_trend():
    t = stats.trend(list(range(2000, 2020)), [4.0] * 20)
    assert t is not None
    assert t["sen_slope"] == 0 and t["mk_p"] == 1.0 and not t["significant"]


def test_mann_kendall_uses_tie_corrected_variance_and_continuity_correction():
    values = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]
    t = stats.trend(list(range(2000, 2010)), values)
    assert t is not None
    assert t["mk_s"] == 40
    assert abs(t["mk_var_s"] - 120.0) < 1e-12
    assert abs(t["mk_z"] - (39.0 / math.sqrt(120.0))) < 1e-12
    assert t["mk_p"] < 0.001
    assert "independent annual observations" in t["mk_test"]


def test_trend_and_prediction_use_only_strict_complete_years():
    monthly = make(1980, 21, lambda y, m: float(y - 1980))
    monthly = [(date, None if date == "1990-07" else value) for date, value in monthly]
    result = stats.analyse(monthly)
    assert result["coverage"]["n_complete_years"] == 20
    assert result["trend"]["n_years"] == 20
    assert result["prediction"]["available"] is True


def test_prediction_is_bounded_in_horizon_and_flags_optional_physical_bounds():
    monthly = make(1980, 25, lambda y, m: 50.0 + 2.0 * (y - 1980))
    result = stats.analyse(monthly, param="RH2M", horizon=99)
    prediction = result["prediction"]
    assert prediction["available"] is True
    assert prediction["horizon"] == 10
    assert len(prediction["years"]) == 10
    assert prediction["bounds_violated"] is True
    assert prediction["hindcast"]["skill_asserted"] is True

    constant = make(1980, 20, lambda y, m: 4.0)
    constant_prediction = stats.analyse(constant)["prediction"]
    assert constant_prediction["available"] is True
    assert constant_prediction["hindcast"]["skill_asserted"] is False


def test_analysis_is_json_safe_for_constant_series_and_gaps():
    monthly = make(2000, 20, lambda y, m: 4.0)
    monthly[20] = (monthly[20][0], None)
    result = stats.analyse(monthly)
    json.dumps(result, allow_nan=False)
    assert result["trend"]["n_years"] == 19
    assert result["prediction"]["available"] is False


def test_too_few_years_gives_no_trend():
    assert stats.trend([2020, 2021, 2022], [1.0, 2.0, 3.0]) is None


def test_extreme_month_is_flagged():
    rng = np.random.default_rng(3)
    monthly = make(1990, 30, lambda y, m: 20 + rng.normal(0, 1))
    monthly[100] = (monthly[100][0], 40.0)
    result = stats.analyse(monthly)
    assert monthly[100][0] in [e["date"] for e in result["extremes"]]


def test_parse_power_drops_annual_key_and_fill_values():
    body = {
        "header": {"fill_value": -999, "sources": ["MERRA2"]},
        "parameters": {"T2M": {"units": "C", "longname": "Temperature at 2 Meters"}},
        "properties": {"parameter": {"T2M": {"202001": 14.1, "202002": -999, "202013": 22.0}}},
    }
    series = power.parse_power(body, "T2M")
    assert series["values"] == [["2020-01", 14.1], ["2020-02", None]]
    assert series["unit"] == "°C" and "MERRA2" in series["source"]


def test_cut_keeps_only_the_chosen_years():
    series = {"values": [["1999-12", 1.0], ["2000-01", 2.0], ["2001-01", None], ["2002-01", 3.0]]}
    out = power.cut(series, 2000, 2001)
    assert len(out["values"]) == 24
    assert out["values"][0] == ("2000-01", 2.0)
    assert out["values"][-1] == ("2001-12", None)
    assert out["months_inserted"] == 22
    assert out["coverage"] == "2000-01 to 2000-01"
