import type { Analysis } from "../api/client";
import { getScience } from "../data/science";
import Equation from "./Equation";
import { fmt, signed } from "./format";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export default function DeepAnalysis({ result }: { result: Analysis }) {
  const science = getScience(result.param);
  const season = result.seasonality;
  const t = result.trend;
  const complete = result.annual.filter((row) => row.complete_12_months);
  const last = complete[complete.length - 1];
  const first = complete[0];
  const lowest = result.monthly.filter((row) => row.value !== null).reduce<typeof result.monthly[number] | null>((a, b) => a === null || b.value! < a.value! ? b : a, null);
  const highest = result.monthly.filter((row) => row.value !== null).reduce<typeof result.monthly[number] | null>((a, b) => a === null || b.value! > a.value! ? b : a, null);
  return (
    <div className="analysis-scroll" tabIndex={0} aria-label="Deep analysis content">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-semibold">{result.label}</h3><span className="code-tag">{result.param} · {result.unit}</span></div>
      <p className="mt-2">{science.definition}</p>
      <section className="report-section">
        <h3>What this record shows</h3>
        {last && first ? <p className="mt-2">The latest day-weighted annual summary is <strong>{fmt(last.value)} {result.unit}</strong> ({last.year}). The raw endpoint difference from {first.year} is {signed(last.value - first.value)} {result.unit}{t ? `; the robust trend estimate is ${signed(t.change_per_decade)} ${result.unit} per decade.` : "."}</p> : <p className="mt-2">There are no complete years for an endpoint comparison. Monthly observations still provide descriptive information.</p>}
        {season.amplitude !== null && season.peak_month && season.trough_month && <p className="mt-2">Across this period, the calendar-month mean peaks in <strong>{MONTHS[season.peak_month - 1]}</strong> ({fmt(season.peak_value)} {result.unit}) and is lowest in <strong>{MONTHS[season.trough_month - 1]}</strong> ({fmt(season.trough_value)} {result.unit}). The seasonal peak-to-trough range is {fmt(season.amplitude)} {result.unit}; it is not a trend or a sinusoid’s half-amplitude.</p>}
        {highest && lowest && <p className="mt-2 text-xs text-dim">Monthly record range: {fmt(lowest.value)} ({lowest.date}) to {fmt(highest.value)} ({highest.date}) {result.unit}. {result.extremes.length} months have |z| &gt; 2 relative to their own calendar-month climatology. These are not daily extremes or return-period estimates.</p>}
      </section>
      <section className="report-section">
        <h3>Physical interpretation</h3>
        <p className="mt-2">{science.mechanisms}</p>
        <p className="note-box mt-3">These are scientifically plausible processes, not identified causes of this local pattern. A single variable’s series cannot separate forcing, circulation, land use and model artifacts.</p>
      </section>
      <section className="report-section">
        <h3>Scientific laws · explanatory, not fitted</h3>
        {science.equations.map((equation) => <div key={equation.title} className="mt-3">
          <h4>{equation.title}</h4><Equation latex={equation.latex} label={equation.title} /><p className="text-xs text-dim">{equation.note}</p>
        </div>)}
      </section>
      <section className="report-section">
        <h3>What to be careful about</h3>
        <p className="mt-2">{science.caveat}</p>
        {result.aggregation_note && <p className="note-box mt-2">{result.aggregation_note}</p>}
        <p className="mt-2">{result.source}. Coverage: {result.coverage}; {result.data_coverage.n_valid_months}/{result.data_coverage.n_input_months} expected calendar months have valid values, {result.data_coverage.n_complete_years} complete years. {result.months_inserted > 0 && `${result.months_inserted} absent source months were inserted as missing, never interpolated. `}Meteorological MERRA-2 values represent a 0.5° × 0.625° grid cell; solar products have their own source grids. This is not a weather-station record.</p>
        <p className="mt-2 text-xs text-dim">Seasonal patterns and monthly z-scores use the selected period as their reference, not a fixed 30-year normal. Changing the period changes the comparison. Independent observations and related variables are needed before attributing a mechanism.</p>
      </section>
      <details className="method-details">
        <summary>Seasonal calculations</summary>
        <Equation latex={String.raw`\mu_m=\frac{1}{N_m}\sum_{j=1}^{N_m}v_{j,m},\qquad A=\max_m\mu_m-\min_m\mu_m`} />
        <p className="text-xs text-dim">Nₘ counts available observations for the same calendar month. A is a descriptive seasonal range; this calculation does not test whether a seasonal cycle is significant.</p>
      </details>
      <div className="report-references">{science.references.map((ref, i) => <span key={ref.url}>{i > 0 && " · "}<a href={ref.url} target="_blank" rel="noreferrer">{ref.title}</a></span>)}</div>
    </div>
  );
}
