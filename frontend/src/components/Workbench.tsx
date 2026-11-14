import { useEffect, useMemo, useRef, useState } from "react";
import { getAnalysis, type Analysis } from "../api/client";
import type { Place } from "../App";
import { CUSTOM_NAMES, PARAMS, paramLabel, type Role, type ShowOptions } from "../roles";
import { CustomParamDialog, HealthDialog, SourcesDialog } from "./Dialogs";
import ScientificMap from "./ScientificMap";
import MenuBar, { type Menu, type MenuItem } from "./MenuBar";
import Pane, { Hint } from "./Pane";
import Plot, { savePng } from "./Plot";
import TrendPane from "./TrendPane";
import DeepAnalysis from "./DeepAnalysis";
import ExplainerVideo from "./ExplainerVideo";
import { makeSeriesTraces, type Layers } from "./seriesTraces";
import { CitySearch, NumberBox } from "./Toolbar";
import LearningDock, { type DockRequest, type View } from "../learn/LearningDock";
import CuriousStrip from "../learn/CuriousStrip";

const APP_NAME = "Earth's Data Analysis Application";

const FIRST_YEAR = 1981;
const LAST_YEAR = new Date().getFullYear() - 1;
type PaneId = "series" | "map" | "trend" | "deep";
const PANE_TITLES: Record<PaneId, string> = { series: "Time series", map: "Scientific map", trend: "Trend and prediction", deep: "Deep analysis" };
const FRIENDLY_TITLES: Record<PaneId, string> = { series: "How it changes over time", map: "Pick a place on Earth", trend: "Trend and future", deep: "What it means" };
const PANE_ICONS: Record<PaneId, string> = { series: "📈", map: "🗺️", trend: "🔮", deep: "🧠" };
const PANE_IDS: PaneId[] = ["series", "map", "trend", "deep"];
const ALL_VISIBLE = { series: true, map: true, trend: true, deep: true };
const LAYER_LABELS: Record<keyof Layers, string> = { mean: "Mean", max: "Max", min: "Min", trend: "Trend line" };
const LAYER_TITLES: Record<keyof Layers, string> = {
  mean: "Centered 12-month arithmetic mean", max: "Highest monthly aggregate in each year", min: "Lowest monthly aggregate in each year", trend: "Theil–Sen trend on complete annual means",
};
function coords(place: Place) {
  return `${Math.abs(place.lat).toFixed(2)}° ${place.lat >= 0 ? "N" : "S"}, ${Math.abs(place.lon).toFixed(2)}° ${place.lon >= 0 ? "E" : "W"}`;
}
function download(filename: string, text: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
export default function Workbench({ role, onChangeRole }: { role: Role; onChangeRole: () => void }) {
  const plain = role.detail === "plain";
  const curious = role.id === "curious";
  const [video, setVideo] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [dock, setDock] = useState<DockRequest | null>(null);
  const openDock = (view: View | "tour") => setDock((d) => ({ view, n: (d?.n ?? 0) + 1 }));
  const [place, setPlace] = useState<Place | null>(null);
  const [param, setParam] = useState(role.params[0]);
  const [start, setStart] = useState(FIRST_YEAR);
  const [end, setEnd] = useState(LAST_YEAR);
  const [alpha, setAlpha] = useState(0.05);
  const [horizon, setHorizon] = useState(5);
  const [allParams, setAllParams] = useState(false);
  const [custom, setCustom] = useState<string[]>([]);
  const [show, setShow] = useState<ShowOptions>({ ...role.show, extremes: false });
  const [layers, setLayers] = useState<Layers>({ mean: true, max: true, min: true, trend: true });
  const [visible, setVisible] = useState<Record<PaneId, boolean>>(ALL_VISIBLE);
  const [maximized, setMaximized] = useState<PaneId | null>(null);
  const [dialog, setDialog] = useState<"sources" | "health" | "custom" | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState(0);
  const latest = useRef(0);
  useEffect(() => {
    if (!place) return;
    const request = ++latest.current;
    const abort = new AbortController();
    setLoading(true); setError(null); setResult(null);
    getAnalysis({ lat: place.lat, lon: place.lon, param, start, end, alpha, horizon }, abort.signal).then(
      (answer) => { if (request === latest.current) { setResult(answer); setLoading(false); } },
      (problem) => { if (request === latest.current && !abort.signal.aborted) { setError(problem instanceof Error ? problem.message : "Something went wrong."); setLoading(false); } },
    );
    return () => { latest.current++; abort.abort(); };
  }, [place, param, start, end, alpha, horizon, runs]);
  function newAnalysis() {
    latest.current++; setPlace(null); setResult(null); setError(null); setLoading(false); setStart(FIRST_YEAR); setEnd(LAST_YEAR);
  }
  const listed = [...new Set([...(allParams ? PARAMS.map((p) => p.code) : role.params), ...custom, param])];
  const quantity = paramLabel(param, plain);
  const yTitle = result ? `${result.label} (${result.unit})` : "";
  const fileStem = result ? `earthpulse_${param}_${result.lat}_${result.lon}_${start}-${end}` : "earthpulse";
  const seriesTraces = useMemo(() => result ? makeSeriesTraces(result, layers, show, curious) : [], [result, layers, show, curious]);
  function exportCsv(annual = false) {
    if (!result) return;
    const lines = [`# Earth's Data Analysis Application: ${result.label} (${result.unit})`, `# ${result.source}, ${result.coverage}`, `# Latitude ${result.lat}, longitude ${result.lon}`,
      ...(annual ? ["year,day_weighted_monthly_mean,min_monthly_value,max_monthly_value,n_months,complete_12_months", ...result.annual.map((row) => [row.year, row.value, row.min, row.max, row.n_months, row.complete_12_months].join(","))]
        : ["date,value,centered_mean_12,z_score", ...result.monthly.map((row) => [row.date, row.value ?? "", row.running ?? "", row.z ?? ""].join(","))]),
    ];
    download(`${fileStem}_${annual ? "annual" : "monthly"}.csv`, lines.join("\n"));
  }
  async function exportPdf() {
    if (!result || pdfBusy) return;
    const pane = (id: PaneId) => (shown.includes(id) ? document.querySelector<HTMLElement>(`section.pane-${id}`) : null);
    setPdfBusy("Preparing the PDF…");
    try {
      const { exportReportPdf } = await import("../report/exportPdf");
      await exportReportPdf({
        appName: APP_NAME, result, placeName: placeName || coords({ lat: result.lat, lon: result.lon, name: null }), quantity: paramLabel(param, true), roleTitle: role.title,
        start, end, alpha, horizon, layers, fileName: `${fileStem}_report`,
        panes: { series: pane("series"), map: pane("map"), trend: pane("trend"), deep: pane("deep") },
        onProgress: (message) => setPdfBusy(message),
      });
    } catch (problem) {
      window.alert(`The PDF could not be created: ${problem instanceof Error ? problem.message : problem}`);
    } finally {
      setPdfBusy(null);
    }
  }
  const toggleLayer = (key: keyof Layers) => setLayers((current) => ({ ...current, [key]: !current[key] }));
  const toggle = (key: keyof ShowOptions, label: string): MenuItem => ({ label, checked: show[key], onClick: () => setShow((current) => ({ ...current, [key]: !current[key] })) });
  const period = (label: string, from: number): MenuItem => ({ label, checked: start === from && end === LAST_YEAR, onClick: () => { setStart(from); setEnd(LAST_YEAR); } });
  const menus: Menu[] = [
    { title: "File", items: [
      { label: "New analysis", onClick: newAnalysis }, { label: "Change role…", onClick: onChangeRole }, { separator: true },
      { label: pdfBusy ?? "Export report (PDF)…", onClick: exportPdf, disabled: !result || !!pdfBusy },
      { label: "Export monthly data (CSV)", onClick: () => exportCsv(), disabled: !result },
      { label: "Export annual range (CSV)", onClick: () => exportCsv(true), disabled: !result },
      { label: "Export time series (PNG)", onClick: () => savePng("plot-series", `${fileStem}_series`), disabled: !result || !visible.series },
      { label: "Make explainer video…", onClick: () => setVideo(true), disabled: !result }, { separator: true },
      { label: "Export trend / prediction (PNG)", onClick: () => savePng("plot-trend", `${fileStem}_trend`), disabled: !result?.prediction.available || !visible.trend },
    ] },
    { title: "View", items: [
      ...PANE_IDS.map((id): MenuItem => ({ label: PANE_TITLES[id], checked: visible[id], onClick: () => { setVisible({ ...visible, [id]: !visible[id] }); setMaximized(null); } })),
      { separator: true },
      ...(Object.keys(LAYER_LABELS) as (keyof Layers)[]).map((key): MenuItem => ({ label: LAYER_LABELS[key], checked: layers[key], onClick: () => toggleLayer(key) })),
      { separator: true }, toggle("monthly", "Monthly observations"), toggle("extremes", "Unusual-month markers (|z| > 2)"),
    ] },
    { title: "Data", items: [
      ...listed.map((code): MenuItem => ({ label: paramLabel(code, plain), checked: code === param, onClick: () => setParam(code) })),
      { separator: true }, { label: "Show all parameters", checked: allParams, onClick: () => setAllParams(!allParams) },
      { label: "Add a NASA POWER parameter…", onClick: () => setDialog("custom") }, { separator: true }, { label: "GRACE wet mass: not connected", disabled: true },
    ] },
    { title: "Analysis", items: [
      period(`Full record (${FIRST_YEAR}–${LAST_YEAR})`, FIRST_YEAR), period("Last 30 years", LAST_YEAR - 29), period("Last 20 years", LAST_YEAR - 19), period("Last 10 years", LAST_YEAR - 9),
      { separator: true }, ...[0.01, 0.05, 0.1].map((a): MenuItem => ({ label: `Significance level α = ${a}`, checked: alpha === a, onClick: () => setAlpha(a) })),
      { separator: true }, { label: "Run again", onClick: () => setRuns(runs + 1), disabled: !place },
    ] },
    { title: "Window", items: [
      { label: "Show all four panes", onClick: () => { setVisible(ALL_VISIBLE); setMaximized(null); } }, { separator: true },
      ...PANE_IDS.map((id): MenuItem => ({ label: `Maximize: ${PANE_TITLES[id]}`, checked: maximized === id, onClick: () => { setVisible({ ...visible, [id]: true }); setMaximized(maximized === id ? null : id); } })),
    ] },
    { title: "Learn", items: [
      { label: "Watch the data story (video)…", onClick: () => setVideo(true), disabled: !result },
      { label: "Ask Terra (chat)…", onClick: () => openDock("chat") },
      { label: "Guided tour", onClick: () => openDock("tour") },
      { label: "Quiz", onClick: () => openDock("quiz"), disabled: !result },
      { label: "Science words (glossary)", onClick: () => openDock("glossary") },
      { label: "Did you know?", onClick: () => openDock("facts") },
    ] },
    { title: "Help", items: [{ label: "How to use the app", onClick: () => openDock("howto") }, { label: "Data & method sources", onClick: () => setDialog("sources") }, { label: "Connection check", onClick: () => setDialog("health") }] },
  ];
  const placeName = place ? place.name ?? coords(place) : "";
  const shown = PANE_IDS.filter((id) => maximized ? id === maximized : visible[id]);
  const empty = curious
    ? (!place ? "👆 Search a city at the top, or click anywhere on the map to start exploring!" : loading ? "🛰️ Getting NASA data… this takes a few seconds." : error ? `😕 Could not load the data. ${error}` : "No data here yet.")
    : (!place ? "Select a point on the map, search a city, or enter coordinates." : loading ? "Loading NASA POWER data and calculating the analysis…" : error ? `Could not load the data. ${error}` : "No data available.");
  const paneProps = (id: PaneId) => ({ kind: id, title: curious ? FRIENDLY_TITLES[id] : PANE_TITLES[id], icon: curious ? PANE_ICONS[id] : undefined, maximized: maximized === id, onMaximize: () => setMaximized(maximized === id ? null : id), onClose: () => { setVisible({ ...visible, [id]: false }); setMaximized(null); } });
  const body: Record<PaneId, JSX.Element> = {
    series: <Pane key="series" {...paneProps("series")} tools={<div className="layer-checkboxes" aria-label="Graph layers">{(Object.keys(LAYER_LABELS) as (keyof Layers)[]).map((key) => <label key={key} title={LAYER_TITLES[key]}><input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} />{LAYER_LABELS[key]}</label>)}</div>}>
      {result ? <div className="absolute inset-0 flex flex-col"><div className="chart-note">{curious ? "Purple line = average of the last 12 months · Shaded band = each year’s highest and lowest month · Pink dashes = long-term trend." : <>{layers.max && layers.min ? "Ribbon = each year’s monthly-value range, not uncertainty." : "Max / Min = highest / lowest monthly value within each year."} Mean = centered 12 months.</>}</div><div className="relative min-h-0 flex-1">{seriesTraces.length ? <Plot id="plot-series" traces={seriesTraces} xTitle="Date" yTitle={yTitle} /> : <Hint>All graph layers are hidden. Enable a checkbox or View &gt; Monthly observations.</Hint>}</div></div> : <Hint>{empty}</Hint>}
    </Pane>,
    map: <Pane key="map" {...paneProps("map")}><ScientificMap selected={place} onSelect={setPlace} param={param} label={quantity} source={result?.source} /></Pane>,
    trend: <Pane key="trend" {...paneProps("trend")}>{result ? <TrendPane result={result} horizon={horizon} onHorizon={setHorizon} /> : <Hint>{empty}</Hint>}</Pane>,
    deep: <Pane key="deep" {...paneProps("deep")}>{result ? <DeepAnalysis result={result} /> : <Hint>{empty}</Hint>}</Pane>,
  };
  return <div className={`app-root flex h-full flex-col ${curious ? "theme-curious" : "theme-science"}`}>
    <MenuBar menus={menus} />
    <div className="toolbar-row flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-shell px-3 py-2">
      <CitySearch onSelect={setPlace} />
      <div className="flex items-center gap-2">
        <label className="tool" htmlFor="lat">Lat<NumberBox id="lat" width="w-20" min={-90} max={90} step={0.01} value={place ? Number(place.lat.toFixed(2)) : 0} onCommit={(lat) => setPlace({ lat, lon: place?.lon ?? 0, name: null })} /></label>
        <label className="tool" htmlFor="lon">Lon<NumberBox id="lon" width="w-20" min={-180} max={180} step={0.01} value={place ? Number(place.lon.toFixed(2)) : 0} onCommit={(lon) => setPlace({ lat: place?.lat ?? 0, lon, name: null })} /></label>
      </div>
      <label className="tool" htmlFor="param">Parameter<select id="param" className="field max-w-64" value={param} onChange={(e) => setParam(e.target.value)}>{listed.map((code) => <option key={code} value={code}>{paramLabel(code, plain)}</option>)}</select></label>
      <div className="flex items-center gap-2">
        <label className="tool" htmlFor="from">From<NumberBox id="from" width="w-16" min={FIRST_YEAR} max={end} value={start} onCommit={setStart} /></label>
        <label className="tool" htmlFor="to">To<NumberBox id="to" width="w-16" min={start} max={LAST_YEAR} value={end} onCommit={setEnd} /></label>
        <label className="tool" htmlFor="alpha">α<select id="alpha" className="field" value={alpha} onChange={(e) => setAlpha(Number(e.target.value))}><option value={0.01}>0.01</option><option value={0.05}>0.05</option><option value={0.1}>0.10</option></select></label>
      </div>
      <button type="button" className="btn" onClick={newAnalysis}>New analysis</button>
    </div>
    {curious && <CuriousStrip result={result} place={placeName} quantity={paramLabel(param, true)} loading={loading} error={error} onVideo={() => setVideo(true)} onTour={() => openDock("tour")} onChat={() => openDock("chat")} />}
    <div className={`workbench-grid ${shown.length > 1 ? "multi-pane" : ""} ${maximized ? "maximized-pane" : ""}`}>{shown.length ? shown.map((id) => body[id]) : <Hint>All panes are hidden. Use Window &gt; Show all four panes.</Hint>}</div>
    <footer className="app-footer flex flex-wrap gap-x-4 border-t border-rule bg-shell px-3 py-1.5 text-xs text-dim" role="status"><span className="flex-1">{!place ? "Ready · no location selected" : loading ? "Loading NASA POWER…" : error ? "Analysis failed · see panes" : `${place.name ? place.name + " · " : ""}${coords(place)}`}</span>{result && <span>{result.source} · {result.coverage}</span>}<span>{role.title}</span></footer>
    <LearningDock ctx={{ result, place: placeName, quantity: paramLabel(param, true), role: role.id, start, end, alpha, loading, error }} curious={curious} onVideo={() => setVideo(true)} onPdf={exportPdf} pdfBusy={pdfBusy} request={dock} />
    {video && result && <ExplainerVideo result={result} place={placeName} quantity={paramLabel(param, true)} onClose={() => setVideo(false)} />}
    {dialog === "sources" && <SourcesDialog onClose={() => setDialog(null)} />}
    {dialog === "health" && <HealthDialog onClose={() => setDialog(null)} />}
    {dialog === "custom" && <CustomParamDialog onClose={() => setDialog(null)} onAdd={(code, name) => { if (name && name !== code) CUSTOM_NAMES.set(code, name); setCustom([...new Set([...custom, code])]); setParam(code); setDialog(null); }} />}
  </div>;
}
