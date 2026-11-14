# Earth's Data Analysis Application analysis contract

`app.stats.analyse(monthly, alpha=0.05, param="", horizon=5, bounds=None)` preserves the existing `monthly`, `annual`, `climatology`, `trend`, `extremes`, and `months_missing` keys and adds `seasonality`, `prediction`, `trend_availability`, and `coverage`. The same `alpha` controls both the trend confidence limits/tests and the prediction interval: `alpha=0.05` is the default 95% level. All numeric output is a native finite `int`/`float`; undefined or non-finite values are `None`. No physical clipping is performed.

## Monthly and annual data

- `monthly` contains one row per input pair: `{date, value, running, z}`. Missing/non-finite input values become `None`.
- `annual` is the display series and keeps years with at least 10 valid monthly values. Each row is `{year, value, n_months, min, max, complete, complete_12_months, missing_months}`. `value` is the calendar-day-weighted mean of valid monthly aggregate values, including leap-year month lengths. It is a time-weighted rate for mean-rate products and a summary (not an annual extreme) for extrema-derived parameters. `min` and `max` are the minimum and maximum of those monthly aggregate values, never daily values.
- `complete_12_months` is true only when all twelve calendar months have one valid monthly value. Only these rows are used for `trend` and `prediction`; years with 10–11 valid months remain visible in the chart but are excluded from inference.
- Duplicate records for one year-month are averaged before annual aggregation. Invalid dates are ignored.
- `climatology` is the calendar-month mean, sample standard deviation (`ddof=1`), and count. `seasonality` reports the calendar-month peak, trough, and peak-minus-trough amplitude from that climatology.

## Trend

`trend` is `None` with fewer than 10 strict complete years. `trend_availability` always gives `{available, reason}`; the current unavailable reason is `at_least_10_strict_complete_years_required`. Otherwise `trend` contains the legacy Sen, MK, OLS, and significance fields plus:

- `mk_s`, `mk_var_s`, `mk_z`, `mk_tau`, `mk_p`: Mann–Kendall score, tie-corrected variance, Kendall tau-b, continuity-corrected normal Z, and two-sided normal p-value.
- MK uses `S = sum(sign(x_j-x_i))`; ties use `Var(S) = [n(n-1)(2n+5) - sum(t_j(t_j-1)(2t_j+5))]/18`. For `S > 0`, `Z=(S-1)/sqrt(Var(S))`; for `S < 0`, `Z=(S+1)/sqrt(Var(S))`; for `S=0`, `Z=0`. `p=2*NormalSF(|Z|)`. A constant series has variance 0, `Z=0`, `p=1`, and tau 0.
- MK is the ordinary, unadjusted test for independent annual observations. It is not a seasonal MK test and does not correct for serial autocorrelation.
- Sen slope and its confidence limits use `scipy.stats.theilslopes(..., alpha=1-alpha, method="separate")`. Its intercept is `median(y) - slope*median(x)`.
- OLS fields include `ols_slope`, `ols_intercept`, `ols_stderr`, `ols_p`, `r_squared`, and `residual_std`. Degenerate OLS fits return `None` for the OLS-dependent fields.
- `sen_equation`, `ols_equation`, and `interpretation` are concise render-ready strings; they do not change the underlying numerical calculations.
- `residual_lag1` and `durbin_watson` use only adjacent calendar years (`year[i]-year[i-1] == 1`); gaps split the residual sequence and never create a gap-spanning pair. DW is `sum((e_t-e_(t-1))^2)/sum(e_t^2)` over residuals in contiguous runs with at least two years. It is `None` when no valid pair or denominator exists.

## Prediction and hindcast

`prediction` is unavailable unless there are at least 20 strict complete years. It is explicitly a conditional **OLS linear extrapolation**, not a climate forecast. `horizon` is coerced to the inclusive range 1–10, default 5. The payload includes `alpha`, `confidence_level = 1-alpha`, and a render-ready `equation`. For each future year `x*`, the estimate is `b0+b1*x*`; the two-sided `(1-alpha)` Student-t prediction interval (95% by default) is:

```text
estimate ± t_(0.975, n-2) * s * sqrt(1 + 1/n + (x* - xbar)^2 / Sxx)
```

where `s=sqrt(SSE/(n-2))` and the multiplier is `t_(1-alpha/2,n-2)`. Each prediction row contains `{year, value, lower, upper, extrapolation, value_violates_bounds, interval_violates_bounds}`. Bounds can be supplied as `bounds=(lower, upper)` or inferred from `param`: `RH2M` → `[0,100]`, `GWETTOP`/`GWETROOT` → `[0,1]`, and an exact whitelist of recognized nonnegative rate/flux parameters → `[0,∞)`. Unknown custom codes are not assigned guessed bounds. Violations are flags only; estimates and intervals are never clipped.

Unavailable prediction results always include `available: false` and an explicit `reason`: `at_least_20_complete_years_required` for insufficient history or `degenerate_ols` when the fit cannot be formed.

The hindcast evaluates the last `min(10, floor(n/4))` complete years using expanding OLS windows, requiring at least 15 training years, and compares RMSE with last-year persistence. `skill_asserted` is true only when linear RMSE is strictly lower than persistence RMSE. Equal or worse RMSE produces the explicit no-skill interpretation.

## Coverage

The API renames calculated `coverage` to `data_coverage` and retains the original textual `coverage`. POWER `cut` normalizes to a complete calendar-month sequence for the chosen period, inserts `None` for absent source keys, and exposes `months_inserted`. The running mean additionally rejects non-consecutive calendar windows.

`coverage` reports first/last valid month, input and valid month counts, valid fraction, number of display annual rows, and number of strict complete years. `months_missing` remains the count of missing/non-finite input values.

## References

The MK score, tie correction, and continuity correction follow the R `trend::mk.test` documentation [1]. Theil–Sen separate-intercept behavior follows SciPy [2]. The Student-t prediction interval follows Penn State STAT 462 [3]. The Durbin–Watson definition follows statsmodels [4].

[1]: https://search.r-project.org/CRAN/refmans/trend/help/mk.test.html "R trend package Mann–Kendall test"
[2]: https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html "SciPy theilslopes documentation"
[3]: https://online.stat.psu.edu/stat462/node/151/ "Penn State STAT 462 prediction interval"
[4]: https://www.statsmodels.org/stable/generated/statsmodels.stats.stattools.durbin_watson.html "statsmodels Durbin–Watson documentation"
