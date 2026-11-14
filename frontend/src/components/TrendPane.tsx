import { useMemo } from "react";
import type { Analysis } from "../api/client";
import Equation from "./Equation";
import Plot from "./Plot";
import { fmt, signed, pText, latexNumber as ln } from "./format";

const AXIS = { tickformat: "d", dtick: 10 };
function Metric({ title, value, note }: { title: string; value: string; note?: string }) {
  return <div className="metric"><span>{title}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

export default function TrendPane({ result, horizon, onHorizon }: { result: Analysis; horizon: number; onHorizon: (n: number) => void }) {
  const t = result.trend;
  const p = result.prediction;
  const u = result.unit;
  const complete = result.annual.filter((row) => row.complete_12_months);
  const traces = useMemo(() => {
    const observed = result.annual.filter((row) => row.complete_12_months);
    const items: object[] = [{ x: observed.map((row) => row.year), y: observed.map((row) => row.value), name: "Annual summary", type: "scatter", mode: "lines+markers", line: { color: "#183f57", width: 1.5 }, marker: { size: 4 } }];
    const tr = result.trend;
    if (tr) items.push({ x: [tr.first_year, tr.last_year], y: [tr.sen_intercept + tr.sen_slope * tr.first_year, tr.sen_intercept + tr.sen_slope * tr.last_year], name: "Sen trend", type: "scatter", mode: "lines", line: { color: "#ae4934", width: 2, dash: "dash" } });
    const prediction = result.prediction;
    if (prediction.available) {
      const rows = prediction.years;
      items.push({ x: rows.map((row) => row.year), y: rows.map((row) => row.lower), name: "Lower prediction bound", type: "scatter", mode: "lines", line: { width: 0 }, showlegend: false });
      items.push({ x: rows.map((row) => row.year), y: rows.map((row) => row.upper), name: `${Math.round(prediction.confidence_level * 100)}% prediction interval`, type: "scatter", mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: "rgba(65,133,155,0.17)" });
      items.push({ x: rows.map((row) => row.year), y: rows.map((row) => row.value), name: "Conditional OLS extrapolation", type: "scatter", mode: "lines+markers", line: { color: "#43859b", width: 2, dash: "dot" }, marker: { size: 5 } });
    }
    return items;
  }, [result]);
  const lastPrediction = p.years[p.years.length - 1];
  const pct = Math.round(p.confidence_level * 100);
  const xbar = complete.length ? complete.reduce((sum, row) => sum + row.year, 0) / complete.length : 0;
  const sxx = complete.reduce((sum, row) => sum + (row.year - xbar) ** 2, 0);
  const sst = t ? complete.reduce((sum, row) => sum + (row.value - t.mean) ** 2, 0) : 0;
  return (
    <div className="analysis-scroll" tabIndex={0} aria-label="Trend and prediction content">
      {t ? <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`verdict ${t.significant ? "verdict-positive" : ""}`}>{t.significant ? "Significant monotonic trend" : "No significant monotonic trend"}</span>
          <span className="text-xs text-dim">p {pText(t.mk_p)} · α {t.alpha}</span>
        </div>
        <div className="metrics-grid">
          <Metric title="Change / decade" value={`${signed(t.change_per_decade)} ${u}`} note="Sen estimate" />
          <Metric title="Fitted total change" value={`${signed(t.total_change)} ${u}`} note={`${t.first_year}–${t.last_year}`} />
          <Metric title="Mean annual summary" value={`${fmt(t.mean)} ${u}`} note={`${t.n_years} complete years`} />
        </div>
        <p className="mt-3">{t.significant
          ? `A ${t.sen_slope >= 0 ? "rising" : "falling"} monotonic tendency is detected under the independent-year test. Statistical significance does not establish its cause or practical importance.`
          : "The test does not detect a monotonic trend at the selected significance level. That does not prove there is no change: nonlinear patterns and limited statistical power can matter."}</p>
        <p className="mt-2 text-xs text-dim">Sen slope: {signed(t.sen_slope)} {u}/yr · {Math.round((1 - t.alpha) * 100)}% CI [{fmt(t.sen_slope_low)}, {fmt(t.sen_slope_high)}]. Fitted change is slope × elapsed years, not the raw endpoint difference.</p>
      </> : <div className="note-box">Trend testing needs at least 10 complete 12-month years; {result.data_coverage.n_complete_years} are available. Choose a longer period.</div>}

      <section className="report-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3>Prediction · conditional extrapolation</h3>
          <label className="tool" htmlFor="horizon">Horizon
            <select id="horizon" className="field" value={horizon} onChange={(e) => onHorizon(Number(e.target.value))}>
              {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n} {n === 1 ? "year" : "years"}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-dim">If the historical linear relationship continues. Not a climate-model forecast; emissions, physical feedbacks and regime changes are not modeled.</p>
        {p.available && lastPrediction ? <>
          <div className="relative mt-2 h-[220px]" aria-label="Annual trend and conditional extrapolation chart">
            <Plot id="plot-trend" traces={traces} xTitle="Year" yTitle={`${result.label} (${u})`} xaxis={AXIS} />
          </div>
          <p className="mt-2"><strong>{lastPrediction.year}: {fmt(lastPrediction.value)} {u}</strong> · {pct}% prediction interval [{fmt(lastPrediction.lower)}, {fmt(lastPrediction.upper)}] {u}.</p>
          {p.bounds_violated && <p className="note-box warning mt-2">The extrapolation or interval crosses a physical bound. This linear model is unsuitable there; the values have not been clipped to look realistic.</p>}
          {p.residual_std != null && p.residual_std < 1e-10 && <p className="note-box warning mt-2">Historical residual variability is effectively zero. The calculated interval is degenerate and does not capture observational or model uncertainty.</p>}
          {p.hindcast && <p className="mt-2 text-xs text-dim">Expanding-window check · {p.hindcast.n_test_years} held-out complete years. RMSE: linear {fmt(p.hindcast.rmse_linear)} vs last-observed-year persistence {fmt(p.hindcast.rmse_persistence)} {u}. {p.hindcast.improved ? "Lower error in this historical check; future skill is not guaranteed." : "No improvement over persistence; predictive skill is not demonstrated."}</p>}
        </> : <p className="note-box mt-2">{p.reason === "at_least_20_complete_years_required" ? `At least 20 complete years are needed for extrapolation; ${p.n_complete_years} available.` : "The annual series does not support a stable linear extrapolation."}</p>}
      </section>

      <section className="report-section">
        <h3>Reliability & assumptions</h3>
        <p className="mt-2">Inference uses complete 12-month years. Monthly values are weighted by calendar days, including leap years. For monthly mean rates this gives a time-weighted annual rate, not an accumulated amount. Ordinary Mann–Kendall and slope intervals are not corrected for serial dependence. {t && <>Residual lag-1 correlation: {fmt(t.residual_lag1)}; Durbin–Watson: {fmt(t.durbin_watson)} (adjacent years only).</>}</p>
        <p className="mt-2 text-xs text-dim">The OLS prediction interval assumes a linear mean, independent normally distributed residuals and constant variance. It excludes reanalysis bias, structural model uncertainty and future forcing changes. Looking at many places or variables also requires multiple-testing control.</p>
      </section>

      <details className="method-details" open>
        <summary>Mathematical calculations</summary>
        <p className="mt-2 text-xs text-dim">xᵢ is the calendar year; yᵢ is its day-weighted monthly summary. Displayed substitutions are rounded; calculations retain full precision.</p>
        <h4>1 · Day-weighted annual summary and within-year range</h4>
        <Equation latex={String.raw`y_i=\frac{\sum_{m=1}^{12}d_{i,m}v_{i,m}}{\sum_{m=1}^{12}d_{i,m}},\qquad L_i=\min_m v_{i,m},\quad U_i=\max_m v_{i,m}`} />
        <p className="text-xs text-dim">dᵢ,ₘ is the number of days in each month. For an extremum-derived NASA parameter, yᵢ summarizes its monthly records; it is not an annual extreme. The ribbon spans monthly-value minima/maxima, not confidence bounds. Display-only 10–11-month years normalize by available days and are excluded from inference.</p>
        <h4>2 · Centered 12-month mean and monthly anomaly</h4>
        <Equation latex={String.raw`\widetilde v_t=\frac{1}{12}\sum_{k=-6}^{5}v_{t+k},\qquad z_t=\frac{v_t-\mu_m}{s_m},\qquad s_m=\sqrt{\frac{\sum_{j=1}^{N_m}(v_{j,m}-\mu_m)^2}{N_m-1}}`} />
        <p className="text-xs text-dim">A 12-month window requires all values; it is offset half a month because the window has even length. μₘ and sₘ describe the same calendar month over this selected period. |z| &gt; 2 is a descriptive flag, not an extreme-event probability or causal diagnosis.</p>
        {t && <>
          <h4>3 · Sen’s robust slope</h4>
          <Equation latex={String.raw`\widehat\beta_{\rm Sen}=\operatorname{median}_{i<j}\left(\frac{y_j-y_i}{x_j-x_i}\right)=${ln(t.sen_slope)},\quad a_{\rm Sen}=\operatorname{median}(y)-\widehat\beta_{\rm Sen}\operatorname{median}(x)`} />
          <Equation latex={String.raw`\Delta_{10}=10\widehat\beta_{\rm Sen}=${ln(t.change_per_decade)},\qquad \Delta=\widehat\beta_{\rm Sen}(${t.last_year}-${t.first_year})=${ln(t.total_change)}`} />
          <p className="text-xs text-dim">Slope units are {u}/yr; changes are in {u}. Confidence bounds use SciPy’s Theil–Sen order-statistic method, not ± one OLS standard error.</p>
          <h4>4 · Tie-corrected Mann–Kendall significance</h4>
          <Equation latex={String.raw`S=\sum_{i=1}^{n-1}\sum_{j=i+1}^{n}\operatorname{sgn}(y_j-y_i),\qquad \operatorname{Var}(S)=\frac{n(n-1)(2n+5)-\sum_k t_k(t_k-1)(2t_k+5)}{18}`} />
          <Equation latex={String.raw`Z=\begin{cases}\frac{S-1}{\sqrt{\operatorname{Var}(S)}}&S>0\\0&S=0\\\frac{S+1}{\sqrt{\operatorname{Var}(S)}}&S<0\end{cases},\qquad p=2\left[1-\Phi(|Z|)\right]`} />
          <Equation latex={String.raw`n=${t.n_years},\quad S=${t.mk_s},\quad \operatorname{Var}(S)=${ln(t.mk_var_s)},\quad Z=${ln(t.mk_z)},\quad p${t.mk_p < 0.001 ? "<0.001" : `=${ln(t.mk_p)}`}`} />
          <p className="text-xs text-dim">tₖ is the number of tied annual observations in group k; Φ is the standard normal CDF. Two-sided normal approximation with continuity correction. Reject the no-monotonic-trend null if p &lt; α. A constant series has Z = 0 and p = 1.</p>
          <h4>5 · Ordinary least squares & goodness of fit</h4>
          <Equation latex={String.raw`\widehat b_1=\frac{\sum_i(x_i-\bar x)(y_i-\bar y)}{\sum_i(x_i-\bar x)^2},\quad \widehat b_0=\bar y-\widehat b_1\bar x,\quad \widehat y_i=\widehat b_0+\widehat b_1x_i`} />
          <Equation latex={String.raw`R^2=1-\frac{\sum_i(y_i-\widehat y_i)^2}{\sum_i(y_i-\bar y)^2}`} />
          <p className="text-xs text-dim">{sst === 0 ? "R² is undefined for constant observations; the API uses 0 as a convention." : `R² = ${fmt(t.r_squared)} is the fraction of annual variance explained by this fitted line, not the probability the trend is true.`}</p>
          {p.available && lastPrediction && p.intercept != null && p.slope != null && p.residual_std != null && p.t_critical != null && <>
            <h4>6 · Conditional prediction interval</h4>
            <Equation latex={String.raw`S_{xx}=\sum_i(x_i-\bar x)^2,\quad s=\sqrt{\frac{\sum_i(y_i-\widehat y_i)^2}{n-2}},\qquad \widehat y_*=\widehat b_0+\widehat b_1x_*`} />
            <Equation latex={String.raw`\operatorname{PI}_{1-\alpha}=\widehat y_*\pm t_{1-\alpha/2,\,n-2}\,s\sqrt{1+\frac{1}{n}+\frac{(x_*-\bar x)^2}{S_{xx}}}`} />
            <Equation latex={String.raw`x_*=${lastPrediction.year},\quad\widehat y_*=(${ln(p.intercept)})+(${ln(p.slope)})(${lastPrediction.year})=${ln(lastPrediction.value)}`} />
            <Equation latex={String.raw`\operatorname{PI}=${ln(lastPrediction.value)}\pm(${ln(p.t_critical)})(${ln(p.residual_std)})\sqrt{1+\frac{1}{${t.n_years}}+\frac{(${lastPrediction.year}-${ln(xbar)})^2}{${ln(sxx)}}}`} />
            <p className="text-xs text-dim">The leading 1 includes the variation of a future individual annual observation. Omitting it would produce a narrower confidence interval for the fitted mean, not a prediction interval.</p>
            <h4>7 · Held-out prediction error</h4>
            <Equation latex={String.raw`\operatorname{RMSE}=\sqrt{\frac{1}{N}\sum_{i=1}^{N}(y_i-\widehat y_i)^2}`} />
            <p className="text-xs text-dim">Each held-out year is predicted using only earlier complete years. The comparison baseline uses the last observed annual mean; no future observations leak into fitting.</p>
          </>}
        </>}
      </details>
      <p className="report-references"><a href="https://search.r-project.org/CRAN/refmans/trend/html/mk.test.html" target="_blank" rel="noreferrer">Mann–Kendall</a> · <a href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html" target="_blank" rel="noreferrer">Theil–Sen</a> · <a href="https://online.stat.psu.edu/stat462/node/151/" target="_blank" rel="noreferrer">Prediction intervals</a></p>
    </div>
  );
}
