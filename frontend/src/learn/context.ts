// What Terra knows about the screen: a compact, numeric summary of the current analysis.
import type { Analysis } from "../api/client";
import type { RoleId } from "../roles";
import { fmt, pText, signed } from "../components/format";
import { MONTHS, shownUnit } from "../video/story";

export type LearnContext = {
  result: Analysis | null;
  place: string;
  quantity: string;
  role: RoleId;
  start: number;
  end: number;
  alpha: number;
  loading: boolean;
  error: string | null;
};

export function unitOf(result: Analysis) {
  return shownUnit(result.unit);
}

export function chatContext(c: LearnContext) {
  const base = { place: c.place || undefined, period: `${c.start}–${c.end}`, role: c.role };
  const r = c.result;
  if (!r) return { ...base, summary: c.loading ? "Data is still loading." : c.error ? `The last data request failed: ${c.error}` : "No place or data selected yet." };
  const u = unitOf(r);
  const t = r.trend;
  const s = r.seasonality;
  const p = r.prediction;
  const last = p.available ? p.years[p.years.length - 1] : undefined;
  const facts = {
    first_year: t?.first_year, last_year: t?.last_year, mean: t?.mean, change_per_decade: t?.change_per_decade,
    total_change: t?.total_change, significant: t?.significant, p_value: t?.mk_p, alpha: c.alpha,
    peak_month: s.peak_month ?? undefined, peak_value: s.peak_value ?? undefined,
    trough_month: s.trough_month ?? undefined, trough_value: s.trough_value ?? undefined,
    prediction_year: last?.year, prediction_value: last?.value, prediction_lower: last?.lower, prediction_upper: last?.upper,
    n_unusual_months: r.extremes.length,
  };
  const lines = [
    `Variable: ${r.label} (NASA POWER code ${r.param}), unit ${u || "dimensionless"}. Friendly name: ${c.quantity}.`,
    `Place: ${c.place || "selected point"} at latitude ${r.lat}, longitude ${r.lon}. Source: ${r.source}; coverage ${r.coverage}; ${r.data_coverage.n_complete_years} complete years.`,
  ];
  if (t) lines.push(`Trend ${t.first_year}–${t.last_year}: Sen slope ${signed(t.change_per_decade)} ${u} per decade, fitted total change ${signed(t.total_change)} ${u}; Mann–Kendall p ${pText(t.mk_p)} at alpha ${t.alpha}: ${t.significant ? "significant" : "not significant"}. Mean annual summary ${fmt(t.mean)} ${u}. R² ${fmt(t.r_squared)}.`);
  if (s.peak_month && s.trough_month) lines.push(`Seasons: highest calendar-month mean in ${MONTHS[s.peak_month - 1]} (${fmt(s.peak_value)} ${u}), lowest in ${MONTHS[s.trough_month - 1]} (${fmt(s.trough_value)} ${u}); seasonal range ${fmt(s.amplitude)} ${u}.`);
  if (last) lines.push(`Conditional linear extrapolation for ${last.year}: ${fmt(last.value)} ${u}, ${Math.round(p.confidence_level * 100)}% prediction interval ${fmt(last.lower)} to ${fmt(last.upper)} ${u}.`);
  if (p.hindcast?.rmse_linear != null) lines.push(`Hindcast RMSE: linear ${fmt(p.hindcast.rmse_linear)} vs persistence ${fmt(p.hindcast.rmse_persistence)} ${u}.`);
  lines.push(`${r.extremes.length} months are unusual (|z| > 2 against their own calendar month).`);
  lines.push("Screen: top-left time series (12-month mean, yearly Max–Min ribbon, trend line), top-right map, bottom-left trend & prediction with equations, bottom-right deep scientific analysis.");
  return { ...base, lat: r.lat, lon: r.lon, param: r.param, label: r.label, unit: u, facts, summary: lines.join("\n") };
}
