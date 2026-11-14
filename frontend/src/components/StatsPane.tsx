import type { Analysis } from "../api/client";
import { Hint } from "./Pane";

/** Three significant figures, without scientific notation for ordinary sizes. */
export function fmt(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs < 0.001 || abs >= 1e6) return value.toExponential(2);
  return String(Number(value.toPrecision(3)));
}

function signed(value: number): string {
  return (value > 0 ? "+" : "") + fmt(value);
}

function pText(p: number): string {
  return p < 0.001 ? "< 0.001" : p.toFixed(3);
}

function Verdict({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span className={`inline-block border px-2 py-0.5 font-semibold ${ok ? "border-ink bg-ink text-paper" : "border-rule bg-shell text-dim"}`}>
      {ok ? yes : no}
    </span>
  );
}

function Row({ name, value, note }: { name: string; value: string; note?: string }) {
  return (
    <tr className="border-b border-hover">
      <th scope="row" className="py-1 pr-3 text-left font-normal text-dim">{name}</th>
      <td className="py-1 pr-3 text-right tabular-nums">{value}</td>
      <td className="py-1 text-xs text-dim">{note}</td>
    </tr>
  );
}

type Props = { result: Analysis; plain: boolean; quantity: string };

export default function StatsPane({ result, plain, quantity }: Props) {
  const t = result.trend;
  const unit = result.unit;

  if (!t) {
    return (
      <Hint>
        Not enough complete years in this period to test a trend (at least 10 are needed, {result.annual.length} available).
        Choose a longer period.
      </Hint>
    );
  }

  const footer = (
    <p className="mt-3 border-t border-rule pt-2 text-xs text-dim">
      {result.label} ({unit}). Source: {result.source}, {result.coverage}
      {result.months_missing > 0 && `, ${result.months_missing} months missing`}. Values are for the model grid cell
      (about 50 km) that contains the point, not for a single weather station.
    </p>
  );

  if (plain) {
    const direction = t.sen_slope > 0 ? "went up" : t.sen_slope < 0 ? "went down" : "did not change";
    return (
      <div className="absolute inset-0 overflow-y-auto p-4 text-sm leading-relaxed">
        <p>
          <Verdict ok={t.significant} yes="A real change" no="No clear change" />
        </p>
        <p className="mt-3">
          Between {t.first_year} and {t.last_year}, {quantity.toLowerCase()} here {direction}
          {t.sen_slope !== 0 && (
            <> by about <b>{fmt(Math.abs(t.total_change))} {unit}</b> in total, which is {fmt(Math.abs(t.change_per_decade))} {unit} every ten years</>
          )}
          . The average over the whole period is {fmt(t.mean)} {unit}.
        </p>
        <p className="mt-3">
          {t.significant
            ? "The change is steady enough from year to year that it is very unlikely to be chance."
            : "The ups and downs from one year to the next are larger than the overall change, so this could simply be chance."}
        </p>
        <p className="mt-3 text-dim">
          {result.extremes.length} months were unusually high or low compared with the same month in other years.
        </p>
        {footer}
      </div>
    );
  }

  const pct = Math.round((1 - t.alpha) * 100);
  return (
    <div className="absolute inset-0 overflow-y-auto p-3">
      <p className="mb-2">
        <Verdict ok={t.significant} yes={`Significant (α = ${t.alpha})`} no={`Not significant (α = ${t.alpha})`} />
        <span className="ml-2 text-dim">Mann-Kendall test on annual means</span>
      </p>
      <table className="w-full border-t border-rule">
        <tbody>
          <Row name="Period" value={`${t.first_year} – ${t.last_year}`} note={`${t.n_years} complete years`} />
          <Row name="Mean" value={`${fmt(t.mean)} ${unit}`} />
          <Row name="Total change" value={`${signed(t.total_change)} ${unit}`} note="Sen's slope × period length" />
          <Row name="Change per decade" value={`${signed(t.change_per_decade)} ${unit}`} />
          <Row name="Sen's slope" value={`${signed(t.sen_slope)} ${unit}/yr`} note={`${pct}% CI ${fmt(t.sen_slope_low)} to ${fmt(t.sen_slope_high)}`} />
          <Row name="Mann-Kendall τ" value={t.mk_tau.toFixed(3)} />
          <Row name="p-value" value={pText(t.mk_p)} note="two-sided" />
          <Row name="OLS slope" value={`${signed(t.ols_slope)} ${unit}/yr`} note={`± ${fmt(t.ols_stderr)} (1 s.e.)`} />
          <Row name="R²" value={t.r_squared.toFixed(3)} note="linear fit to annual means" />
          <Row name="Extreme months" value={String(result.extremes.length)} note="|z| > 2 against the monthly climatology" />
        </tbody>
      </table>
      {footer}
    </div>
  );
}
