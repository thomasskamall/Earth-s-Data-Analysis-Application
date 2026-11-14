import type { Analysis } from "../api/client";
import type { ShowOptions } from "../roles";
export type Layers = { mean: boolean; max: boolean; min: boolean; trend: boolean };

const SCIENCE = { min: "#3e7db2", max: "#6e9fbb", fill: "rgba(73,132,170,0.12)", monthly: "#a0a9b2", mean: "#183f57", trend: "#ae4934", extreme: "#8b6577" };
const HAPPY = { min: "#1fb6ff", max: "#ff9f43", fill: "rgba(255,159,67,0.18)", monthly: "#b8b2d6", mean: "#6d4aff", trend: "#e84393", extreme: "#e17055" };
export function makeSeriesTraces(result: Analysis, layers: Layers, show: ShowOptions, happy = false): object[] {
  const c = happy ? HAPPY : SCIENCE;
  const traces: object[] = [];
  // One range per year, with explicit gaps rather than inventing annual data.
  const x: string[] = [];
  const low: (number | null)[] = [], high: (number | null)[] = [];
  result.annual.forEach((row, index) => {
    if (index && row.year !== result.annual[index - 1].year + 1) {
      x.push(`${row.year - 1}-07-01`); low.push(null); high.push(null);
    }
    x.push(`${row.year}-01-01`, `${row.year}-12-31`);
    low.push(row.min, row.min); high.push(row.max, row.max);
  });
  if (layers.min) traces.push({
    x, y: low, name: "Min", type: "scatter", mode: "lines",
    line: { color: c.min, width: happy ? 1.8 : 1.2 }, connectgaps: false,
    hovertemplate: "%{x|%Y}: min %{y:.3g}<extra>Within-year monthly minimum</extra>",
  });
  if (layers.max) traces.push({
    x, y: high, name: layers.min ? "Max–Min Ribbon" : "Max", type: "scatter", mode: "lines",
    line: { color: c.max, width: happy ? 1.8 : 1.2 }, connectgaps: false,
    ...(layers.min ? { fill: "tonexty", fillcolor: c.fill } : {}),
    hovertemplate: "%{x|%Y}: max %{y:.3g}<extra>Within-year monthly maximum</extra>",
  });
  const dates = result.monthly.map((row) => row.date + "-01");
  if (show.monthly) traces.push({
    x: dates, y: result.monthly.map((row) => row.value), name: "Monthly values", type: "scatter", mode: "lines",
    line: { color: c.monthly, width: 0.9 }, connectgaps: false,
  });
  if (layers.mean) traces.push({
    x: dates, y: result.monthly.map((row) => row.running), name: "Mean (12 mo)", type: "scatter", mode: "lines",
    line: { color: c.mean, width: happy ? 3 : 2.1 }, connectgaps: false,
  });
  const t = result.trend;
  if (layers.trend && t) traces.push({
    x: [`${t.first_year}-07-01`, `${t.last_year}-07-01`],
    y: [t.sen_intercept + t.sen_slope * t.first_year, t.sen_intercept + t.sen_slope * t.last_year],
    name: "Sen trend", type: "scatter", mode: "lines", line: { color: c.trend, width: happy ? 3 : 2, dash: "dash" },
  });
  if (show.extremes) {
    const rows = result.extremes;
    if (rows.length) traces.push({
      x: rows.map((row) => row.date + "-01"), y: rows.map((row) => row.value), name: "Unusual months · |z| > 2", type: "scatter", mode: "markers",
      marker: { color: c.extreme, size: happy ? 7 : 5, symbol: "circle-open" },
    });
  }
  return traces;
}
