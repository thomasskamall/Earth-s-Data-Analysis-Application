// Every website request to the FastAPI backend goes through this module.
export type MonthRow = { date: string; value: number | null; running: number | null; z: number | null };
export type YearValue = { year: number; value: number; n_months: number; min: number; max: number; complete_12_months: boolean };
export type ClimMonth = { month: number; mean: number | null; std: number | null; n: number };
export type Trend = {
  n_years: number; first_year: number; last_year: number; mean: number;
  sen_slope: number; sen_intercept: number; sen_slope_low: number; sen_slope_high: number;
  change_per_decade: number; total_change: number;
  mk_s: number; mk_var_s: number; mk_z: number; mk_tau: number; mk_p: number;
  ols_slope: number | null; ols_intercept: number | null; ols_stderr: number | null;
  r_squared: number | null; residual_std: number | null; residual_lag1: number | null; durbin_watson: number | null;
  alpha: number; significant: boolean; interpretation: string;
};
export type PredictionPoint = { year: number; value: number; lower: number; upper: number; value_violates_bounds: boolean; interval_violates_bounds: boolean };
export type Prediction = {
  available: boolean; reason?: string; horizon: number; n_complete_years: number;
  confidence_level: number; years: PredictionPoint[]; bounds_violated?: boolean;
  slope?: number; intercept?: number; residual_std?: number; t_critical?: number;
  hindcast: { n_test_years: number; rmse_linear: number | null; rmse_persistence: number | null; improved: boolean } | null;
};
export type Analysis = {
  aggregation_note?: string | null;
  lat: number; lon: number; param: string; label: string; unit: string; source: string; coverage: string;
  monthly: MonthRow[]; annual: YearValue[]; climatology: ClimMonth[]; trend: Trend | null;
  seasonality: { peak_month: number | null; peak_value: number | null; trough_month: number | null; trough_value: number | null; amplitude: number | null };
  prediction: Prediction;
  extremes: { date: string; value: number; z: number }[]; months_missing: number; months_inserted: number;
  data_coverage: { n_input_months: number; n_valid_months: number; fraction_valid: number | null; n_complete_years: number };
};
export type CityHit = { name: string; region: string; lat: number; lon: number };
export type Health = Record<string, { ok: boolean; detail: string }>;

async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { signal }); }
  catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("The backend is not answering. Keep the backend PowerShell window running on port 8000.");
  }
  if (!response.ok) {
    let detail = `The backend answered with error ${response.status}.`;
    try { const body = await response.json(); if (typeof body.detail === "string") detail = body.detail; } catch { /* keep message */ }
    throw new Error(detail);
  }
  return response.json();
}
export type Query = { lat: number; lon: number; param: string; start: number; end: number; alpha: number; horizon?: number };
export async function getAnalysis(q: Query, signal?: AbortSignal): Promise<Analysis> {
  const query = new URLSearchParams({
    lat: q.lat.toFixed(2), lon: q.lon.toFixed(2), param: q.param,
    start: String(q.start), end: String(q.end), alpha: String(q.alpha), horizon: String(q.horizon ?? 5),
  });
  const answer = await get<Analysis>(`/api/analysis?${query}`, signal);
  if (!answer.prediction || !answer.data_coverage) throw new Error("This frontend needs the updated backend of Earth's Data Analysis Application. Restart the backend from this same project folder.");
  return answer;
}
export function searchCity(name: string): Promise<CityHit[]> { return get(`/api/city?name=${encodeURIComponent(name)}`); }
export function getHealth(): Promise<Health> { return get("/api/health"); }
