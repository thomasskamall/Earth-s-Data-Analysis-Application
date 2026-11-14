"""Statistics for a monthly environmental series.

The public functions are pure: they do not access the network or filesystem.
A monthly series is a list of ``(date, value)`` pairs where ``date`` is
``YYYY-MM`` and ``value`` is a finite float or ``None`` for missing data.
"""
from __future__ import annotations

import math
import calendar
from collections import Counter
from typing import Optional, Sequence

import numpy as np
from scipy import stats as sps

Monthly = Sequence[tuple[str, Optional[float]]]

MIN_MONTHS_PER_YEAR = 10
MIN_YEARS_FOR_TREND = 10
MIN_YEARS_FOR_PREDICTION = 20
EXTREME_Z = 2.0

# These are deliberately conservative, display-only flags. Values are never clipped.
_PARAM_BOUNDS: dict[str, tuple[float, float]] = {
    "RH2M": (0.0, 100.0),
    "GWETTOP": (0.0, 1.0),
    "GWETROOT": (0.0, 1.0),
}
_NONNEGATIVE_PARAMS = {
    "PRECTOTCORR", "PS", "WS10M", "WS2M", "WS50M", "QV2M",
    "ALLSKY_SFC_SW_DWN", "ALLSKY_SFC_LW_DWN", "CLRSKY_SFC_SW_DWN",
}


def _finite(value: object) -> Optional[float]:
    """Return a native finite float, or None for missing/non-finite values."""
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _month_parts(date: str) -> tuple[int, int]:
    year, month = date[:7].split("-")
    return int(year), int(month)


def _annual_rows(monthly: Monthly) -> list[dict]:
    """Build annual aggregates and retain coverage information for each year."""
    grouped: dict[int, dict[int, list[float]]] = {}
    for date, value in monthly:
        try:
            year, month = _month_parts(date)
        except (TypeError, ValueError):
            continue
        if not 1 <= month <= 12:
            continue
        number = _finite(value)
        if number is not None:
            grouped.setdefault(year, {}).setdefault(month, []).append(number)

    rows: list[dict] = []
    for year in sorted(grouped):
        month_values = {
            month: float(np.mean(values))
            for month, values in grouped[year].items()
            if values
        }
        months = sorted(month_values)
        values = [month_values[month] for month in months]
        missing = [month for month in range(1, 13) if month not in month_values]
        complete = len(month_values) == 12 and not missing
        weights = [calendar.monthrange(year, month)[1] for month in months]
        rows.append({
            "year": int(year),
            "value": _finite(np.average(values, weights=weights)) if values else None,
            "n_months": int(len(month_values)),
            "min": _finite(min(values)) if values else None,
            "max": _finite(max(values)) if values else None,
            "complete": bool(complete),
            "complete_12_months": bool(complete),
            "missing_months": missing,
        })
    return rows


def annual_means(monthly: Monthly) -> list[tuple[int, float]]:
    """Return annual means for years with at least ten valid monthly values.

    This compatibility helper retains the original tuple return type. The
    richer annual rows are returned by :func:`analyse`.
    """
    return [
        (row["year"], row["value"])
        for row in _annual_rows(monthly)
        if row["n_months"] >= MIN_MONTHS_PER_YEAR and row["value"] is not None
    ]


def climatology(monthly: Monthly) -> list[dict]:
    """Mean and sample standard deviation of each calendar month (Jan..Dec)."""
    buckets: list[list[float]] = [[] for _ in range(12)]
    for date, value in monthly:
        try:
            _, month = _month_parts(date)
        except (TypeError, ValueError):
            continue
        number = _finite(value)
        if 1 <= month <= 12 and number is not None:
            buckets[month - 1].append(number)
    result: list[dict] = []
    for index, values in enumerate(buckets):
        result.append({
            "month": index + 1,
            "mean": _finite(np.mean(values)) if values else None,
            "std": _finite(np.std(values, ddof=1)) if len(values) > 1 else None,
            "n": int(len(values)),
        })
    return result


def running_mean(monthly: Monthly, window: int = 12) -> list[Optional[float]]:
    """Centred running mean. None wherever the window is incomplete."""
    if window < 1:
        raise ValueError("window must be positive")
    values = [_finite(value) for _, value in monthly]
    month_indices = [int(date[:4]) * 12 + int(date[5:7]) - 1 for date, _ in monthly]
    before = window // 2
    after = window - before - 1
    result: list[Optional[float]] = []
    for index in range(len(values)):
        lo, hi = index - before, index + after
        if lo < 0 or hi >= len(values):
            result.append(None)
            continue
        chunk = values[lo : hi + 1]
        consecutive = all(month_indices[j] == month_indices[j - 1] + 1 for j in range(lo + 1, hi + 1))
        result.append(None if not consecutive or any(value is None for value in chunk) else _finite(np.mean(chunk)))
    return result


def z_scores(monthly: Monthly) -> list[Optional[float]]:
    """How unusual each month is relative to its calendar-month climatology."""
    clim = climatology(monthly)
    result: list[Optional[float]] = []
    for date, value in monthly:
        try:
            _, month = _month_parts(date)
        except (TypeError, ValueError):
            result.append(None)
            continue
        number = _finite(value)
        ref = clim[month - 1] if 1 <= month <= 12 else None
        if number is None or ref is None or ref["mean"] is None or not ref["std"]:
            result.append(None)
        else:
            result.append(_finite((number - ref["mean"]) / ref["std"]))
    return result


def _mk_statistics(values: Sequence[float]) -> tuple[int, float, float, float, float]:
    """Return S, tie-corrected Var(S), tau-b, continuity-corrected Z, p."""
    n = len(values)
    score = 0
    for i in range(n - 1):
        for j in range(i + 1, n):
            difference = values[j] - values[i]
            score += 1 if difference > 0 else -1 if difference < 0 else 0

    tie_term = 0
    for count in Counter(values).values():
        if count > 1:
            tie_term += count * (count - 1) * (2 * count + 5)
    variance = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0
    tie_pairs = sum(count * (count - 1) // 2 for count in Counter(values).values())
    denominator = math.sqrt((n * (n - 1) / 2.0) * (n * (n - 1) / 2.0 - tie_pairs))
    tau = score / denominator if denominator > 0 else 0.0
    if variance > 0:
        if score > 0:
            z = (score - 1.0) / math.sqrt(variance)
        elif score < 0:
            z = (score + 1.0) / math.sqrt(variance)
        else:
            z = 0.0
        p_value = float(2.0 * sps.norm.sf(abs(z)))
    else:
        z, p_value = 0.0, 1.0
    return int(score), float(variance), float(tau), float(z), float(p_value)


def _contiguous_residual_diagnostics(years: np.ndarray, residuals: np.ndarray) -> tuple[Optional[float], Optional[float]]:
    """Lag-1 correlation and DW using only adjacent calendar years.

    Gaps split the residual sequence. The denominator for DW contains only
    residuals in contiguous runs of at least two years, never a gap-spanning
    pair.
    """
    pairs = [
        (i - 1, i)
        for i in range(1, len(years))
        if years[i] - years[i - 1] == 1
    ]
    if not pairs:
        return None, None
    previous = np.asarray([residuals[i] for i, _ in pairs], dtype=float)
    current = np.asarray([residuals[i] for _, i in pairs], dtype=float)
    lag1: Optional[float]
    if len(pairs) >= 2 and np.std(previous) > 0 and np.std(current) > 0:
        lag1 = _finite(np.corrcoef(previous, current)[0, 1])
    else:
        lag1 = None

    selected = sorted({index for pair in pairs for index in pair})
    denominator = float(np.sum(residuals[selected] ** 2))
    numerator = float(np.sum((current - previous) ** 2))
    dw = _finite(numerator / denominator) if denominator > 0 else None
    return lag1, dw


def _ols(years: np.ndarray, values: np.ndarray) -> Optional[dict]:
    """Fit OLS and return finite native values, with None for undefined terms."""
    n = len(years)
    if n < 2:
        return None
    xbar = float(np.mean(years))
    ybar = float(np.mean(values))
    centered = years - xbar
    sxx = float(np.sum(centered ** 2))
    if not math.isfinite(sxx) or sxx <= 0:
        return None
    slope = float(np.sum(centered * (values - ybar)) / sxx)
    intercept = ybar - slope * xbar
    fitted = intercept + slope * years
    residuals = values - fitted
    sse = float(np.sum(residuals ** 2))
    sst = float(np.sum((values - ybar) ** 2))
    r_squared = 1.0 - sse / sst if sst > 0 else 0.0
    r_squared = min(1.0, max(0.0, r_squared)) if math.isfinite(r_squared) else 0.0
    df = n - 2
    mse = sse / df if df > 0 else None
    stderr = math.sqrt(mse / sxx) if mse is not None and mse >= 0 else None
    p_value = None
    if stderr is not None and stderr > 0:
        p_value = _finite(2.0 * sps.t.sf(abs(slope / stderr), df))
    elif stderr == 0 and slope != 0:
        p_value = 0.0
    lag1, dw = _contiguous_residual_diagnostics(years, residuals)
    return {
        "slope": _finite(slope),
        "intercept": _finite(intercept),
        "stderr": _finite(stderr),
        "p_value": p_value,
        "r_squared": _finite(r_squared),
        "residual_std": _finite(math.sqrt(mse)) if mse is not None and mse >= 0 else None,
        "residual_lag1": lag1,
        "durbin_watson": dw,
        "sse": _finite(sse),
        "sxx": _finite(sxx),
        "df": int(df),
        "residuals": residuals,
    }


def _seasonality(clim: list[dict]) -> dict:
    available = [row for row in clim if row["mean"] is not None]
    if not available:
        return {
            "peak_month": None, "peak_value": None,
            "trough_month": None, "trough_value": None,
            "amplitude": None,
        }
    peak = max(available, key=lambda row: row["mean"])
    trough = min(available, key=lambda row: row["mean"])
    return {
        "peak_month": int(peak["month"]),
        "peak_value": _finite(peak["mean"]),
        "trough_month": int(trough["month"]),
        "trough_value": _finite(trough["mean"]),
        "amplitude": _finite(peak["mean"] - trough["mean"]),
    }


def trend(
    years: Sequence[int],
    values: Sequence[float],
    alpha: float = 0.05,
    seasonal: Optional[dict] = None,
) -> Optional[dict]:
    """Trend of annual observations using ordinary independent-observation MK.

    Sen's slope is from SciPy's separate-intercept Theil--Sen estimator. MK is
    the ordinary, unadjusted independent-observation test; it is not a serial
    correlation or seasonal MK correction.
    """
    if len(years) != len(values):
        return None
    pairs = []
    for year, value in zip(years, values):
        number = _finite(value)
        try:
            year_number = int(year)
        except (TypeError, ValueError):
            continue
        if number is not None:
            pairs.append((year_number, number))
    pairs.sort()
    n = len(pairs)
    if n < MIN_YEARS_FOR_TREND:
        return None
    x = np.asarray([pair[0] for pair in pairs], dtype=float)
    y = np.asarray([pair[1] for pair in pairs], dtype=float)

    sen = sps.theilslopes(y, x, alpha=1 - alpha, method="separate")
    sen_slope, sen_intercept, sen_low, sen_high = [float(item) for item in sen]
    mk_s, mk_var, tau, mk_z, mk_p = _mk_statistics(y.tolist())
    ols = _ols(x, y)
    span = float(x[-1] - x[0])
    result = {
        "n_years": int(n),
        "first_year": int(x[0]),
        "last_year": int(x[-1]),
        "mean": _finite(np.mean(y)),
        "sen_slope": _finite(sen_slope),
        "sen_intercept": _finite(sen_intercept),
        "sen_slope_low": _finite(sen_low),
        "sen_slope_high": _finite(sen_high),
        "change_per_decade": _finite(sen_slope * 10.0),
        "total_change": _finite(sen_slope * span),
        "mk_s": int(mk_s),
        "mk_var_s": _finite(mk_var),
        "mk_z": _finite(mk_z),
        "mk_tau": _finite(tau),
        "mk_p": _finite(mk_p),
        "mk_test": "ordinary unadjusted Mann-Kendall; independent annual observations",
        "mk_continuity_correction": True,
        "mk_two_sided": True,
        "ols_slope": ols["slope"] if ols else None,
        "ols_intercept": ols["intercept"] if ols else None,
        "ols_stderr": ols["stderr"] if ols else None,
        "ols_p": ols["p_value"] if ols else None,
        "r_squared": ols["r_squared"] if ols else None,
        "residual_std": ols["residual_std"] if ols else None,
        "residual_lag1": ols["residual_lag1"] if ols else None,
        "durbin_watson": ols["durbin_watson"] if ols else None,
        "alpha": _finite(alpha),
        "significant": bool(mk_p < alpha),
    }
    if ols and ols["slope"] is not None and ols["intercept"] is not None:
        result["ols_equation"] = (
            f"value = {ols['intercept']:.6g} + ({ols['slope']:.6g}) × year"
        )
    else:
        result["ols_equation"] = None
    result["sen_equation"] = (
        f"value = {sen_intercept:.6g} + ({sen_slope:.6g}) × year"
    )
    if mk_p < alpha:
        direction = "increasing" if sen_slope > 0 else "decreasing" if sen_slope < 0 else "flat"
        result["interpretation"] = f"Statistically significant {direction} monotonic trend"
    else:
        result["interpretation"] = "No statistically significant monotonic trend detected"
    if seasonal:
        result.update({
            "seasonal_peak_month": seasonal.get("peak_month"),
            "seasonal_trough_month": seasonal.get("trough_month"),
            "seasonal_amplitude": seasonal.get("amplitude"),
        })
    return result


def _bounds_for(param: str = "", bounds: Optional[tuple[float, float]] = None) -> Optional[dict]:
    if bounds is not None:
        try:
            low, high = float(bounds[0]), float(bounds[1])
        except (TypeError, ValueError, IndexError):
            return None
        if math.isfinite(low) and math.isfinite(high) and low <= high:
            return {"lower": low, "upper": high, "source": "caller"}
        return None
    key = (param or "").upper().replace(" ", "")
    if key in _PARAM_BOUNDS:
        low, high = _PARAM_BOUNDS[key]
        return {"lower": low, "upper": high, "source": "parameter"}
    if key in _NONNEGATIVE_PARAMS:
        return {"lower": 0.0, "upper": None, "source": "parameter"}
    return None


def _prediction(
    years: list[int],
    values: list[float],
    horizon: int,
    alpha: float,
    param: str,
    bounds: Optional[tuple[float, float]],
) -> dict:
    """Conditional OLS linear extrapolation and expanding-window hindcast."""
    horizon = min(10, max(1, int(horizon)))
    n = len(years)
    result: dict = {
        "available": False,
        "horizon": int(horizon),
        "n_complete_years": int(n),
        "min_complete_years": MIN_YEARS_FOR_PREDICTION,
        "alpha": _finite(alpha),
        "confidence_level": _finite(1.0 - alpha),
        "method": "OLS conditional linear extrapolation",
        "not_a_climate_forecast": True,
        "physical_bounds": _bounds_for(param, bounds),
        "years": [],
        "hindcast": None,
    }
    if n < MIN_YEARS_FOR_PREDICTION:
        result["reason"] = "at_least_20_complete_years_required"
        return result

    x = np.asarray(years, dtype=float)
    y = np.asarray(values, dtype=float)
    ols = _ols(x, y)
    if ols is None or ols["slope"] is None or ols["intercept"] is None or ols["sxx"] is None:
        result["reason"] = "degenerate_ols"
        return result
    slope = float(ols["slope"])
    intercept = float(ols["intercept"])
    xbar = float(np.mean(x))
    sxx = float(ols["sxx"])
    sse = float(ols["sse"] or 0.0)
    df = n - 2
    residual_scale = math.sqrt(sse / df) if df > 0 else None
    t_critical = float(sps.t.ppf(1.0 - alpha / 2.0, df)) if df > 0 else None
    physical = result["physical_bounds"]

    points = []
    for step in range(1, horizon + 1):
        year = int(years[-1] + step)
        x_star = float(year)
        estimate = intercept + slope * x_star
        if residual_scale is not None and t_critical is not None:
            standard_error = residual_scale * math.sqrt(1.0 + 1.0 / n + (x_star - xbar) ** 2 / sxx)
            margin = t_critical * standard_error
            lower, upper = estimate - margin, estimate + margin
        else:
            lower = upper = estimate
        value_violation = False
        interval_violation = False
        if physical is not None:
            low = physical["lower"]
            high = physical["upper"]
            value_violation = bool((low is not None and estimate < low) or (high is not None and estimate > high))
            interval_violation = bool((low is not None and lower < low) or (high is not None and upper > high))
        points.append({
            "year": year,
            "value": _finite(estimate),
            "lower": _finite(lower),
            "upper": _finite(upper),
            "extrapolation": True,
            "value_violates_bounds": value_violation,
            "interval_violates_bounds": interval_violation,
        })

    test_count = min(10, n // 4)
    predictions: list[float] = []
    observations: list[float] = []
    persistence: list[float] = []
    for index in range(n - test_count, n):
        train_x, train_y = x[:index], y[:index]
        fit = _ols(train_x, train_y)
        if fit is None or fit["slope"] is None or fit["intercept"] is None:
            continue
        predictions.append(float(fit["intercept"] + fit["slope"] * x[index]))
        observations.append(float(y[index]))
        persistence.append(float(y[index - 1]))
    rmse_linear = math.sqrt(float(np.mean((np.asarray(predictions) - np.asarray(observations)) ** 2))) if predictions else None
    rmse_persistence = math.sqrt(float(np.mean((np.asarray(persistence) - np.asarray(observations)) ** 2))) if predictions else None
    improved = bool(
        rmse_linear is not None and rmse_persistence is not None and rmse_linear < rmse_persistence
    )
    result["available"] = True
    result.pop("reason", None)
    result.update({
        "slope": _finite(slope),
        "intercept": _finite(intercept),
        "equation": f"value = {intercept:.6g} + ({slope:.6g}) × year",
        "residual_std": _finite(residual_scale),
        "t_critical": _finite(t_critical),
        "years": points,
        "bounds_violated": bool(any(point["value_violates_bounds"] or point["interval_violates_bounds"] for point in points)),
        "hindcast": {
            "method": "expanding-window OLS versus last-year persistence",
            "n_test_years": int(len(predictions)),
            "n_test_target": int(test_count),
            "min_training_years": 15,
            "rmse_linear": _finite(rmse_linear),
            "rmse_persistence": _finite(rmse_persistence),
            "improved": improved,
            "skill_asserted": improved,
            "interpretation": "linear model improves RMSE over persistence" if improved else "no skill asserted: linear model does not improve RMSE over persistence",
        },
    })
    return result


def analyse(
    monthly: Monthly,
    alpha: float = 0.05,
    param: str = "",
    horizon: int = 5,
    bounds: Optional[tuple[float, float]] = None,
) -> dict:
    """Return chart data plus strict complete-year trend and prediction results."""
    annual_rows = _annual_rows(monthly)
    running = running_mean(monthly)
    z = z_scores(monthly)
    rows = [
        {"date": date, "value": _finite(value), "running": running[index], "z": z[index]}
        for index, (date, value) in enumerate(monthly)
    ]
    extremes = [
        {"date": row["date"], "value": row["value"], "z": row["z"]}
        for row in rows
        if row["z"] is not None and abs(row["z"]) > EXTREME_Z
    ]
    clim = climatology(monthly)
    seasonality = _seasonality(clim)
    display_annual = [row for row in annual_rows if row["n_months"] >= MIN_MONTHS_PER_YEAR]
    complete_annual = [row for row in annual_rows if row["complete_12_months"]]
    complete_years = [row["year"] for row in complete_annual]
    complete_values = [row["value"] for row in complete_annual]
    complete_values = [value for value in complete_values if value is not None]
    # A complete row always has a value; this guard keeps the JSON contract safe.
    if len(complete_values) != len(complete_years):
        complete_years, complete_values = [], []
    trend_result = trend(complete_years, complete_values, alpha, seasonal=seasonality)
    trend_availability = {
        "available": trend_result is not None,
        "reason": None if trend_result is not None else "at_least_10_strict_complete_years_required",
    }

    valid_dates = [date for date, value in monthly if _finite(value) is not None]
    coverage = {
        "first_month": min(valid_dates) if valid_dates else None,
        "last_month": max(valid_dates) if valid_dates else None,
        "n_input_months": int(len(monthly)),
        "n_valid_months": int(sum(1 for _, value in monthly if _finite(value) is not None)),
        "fraction_valid": _finite(
            sum(1 for _, value in monthly if _finite(value) is not None) / len(monthly)
        ) if monthly else None,
        "n_annual_display_years": int(len(display_annual)),
        "n_complete_years": int(len(complete_years)),
        "strict_complete_years_for_inference": True,
    }
    return {
        "monthly": rows,
        "annual": display_annual,
        "climatology": clim,
        "seasonality": seasonality,
        "trend": trend_result,
        "trend_availability": trend_availability,
        "prediction": _prediction(complete_years, complete_values, horizon, alpha, param, bounds),
        "extremes": extremes,
        "months_missing": int(sum(1 for _, value in monthly if _finite(value) is None)),
        "coverage": coverage,
    }
