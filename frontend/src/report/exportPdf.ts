import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas-pro";
import Plotly from "plotly.js-basic-dist-min";
import type { Analysis } from "../api/client";

export type ReportInput = {
  appName: string;
  result: Analysis;
  placeName: string;
  quantity: string;
  roleTitle: string;
  start: number;
  end: number;
  alpha: number;
  horizon: number;
  layers: { mean: boolean; max: boolean; min: boolean; trend: boolean };
  panes: { series: HTMLElement | null; map: HTMLElement | null; trend: HTMLElement | null; deep: HTMLElement | null };
  fileName: string;
  onProgress?: (message: string) => void;
};

type Pdf = jsPDF;
type ImageDataUrl = string;

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 16;
const HEADER_H = 19;
const FOOTER_H = 13;
const BODY_TOP = HEADER_H + 4;
const BODY_BOTTOM = PAGE_H - FOOTER_H - 4;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const BODY_H = BODY_BOTTOM - BODY_TOP;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/α/g, "alpha")
    .replace(/σ/g, "sigma")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/≠/g, "!=")
    .replace(/±/g, "+/-")
    .replace(/−/g, "-")
    .replace(/–|—/g, "-")
    .replace(/·/g, " / ")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (char) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(char)))
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (char) => `^${"⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(char)}`)
    .replace(/\u00a0/g, " ")
    .replace(/[\u0080-\uffff]/g, "?");
}

function number(value: unknown, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "not available";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function signed(value: unknown, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "not available";
  return `${value >= 0 ? "+" : ""}${number(value, digits)}`;
}

function pValue(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "not available";
  return value < 0.001 ? "p < 0.001" : `p = ${number(value, 3)}`;
}

function coordinateText(result: Analysis): string {
  const ns = result.lat >= 0 ? "N" : "S";
  const ew = result.lon >= 0 ? "E" : "W";
  return `${Math.abs(result.lat).toFixed(2)} deg ${ns}, ${Math.abs(result.lon).toFixed(2)} deg ${ew}`;
}

function safeFileName(value: string): string {
  return value.trim().replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]+/g, "_") || "earthpulse_report";
}

function progress(input: ReportInput, message: string): void {
  input.onProgress?.(message);
}

function addPageTitle(pdf: Pdf, title: string): void {
  pdf.setTextColor(31, 41, 55);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(cleanText(title), MARGIN_X, BODY_TOP + 7);
}

function addPage(pdf: Pdf, title: string): void {
  pdf.addPage("a4", "portrait");
  addPageTitle(pdf, title);
}

function addWrapped(pdf: Pdf, value: unknown, x: number, y: number, width: number, fontSize = 9, lineHeight = 4.5): number {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(fontSize);
  pdf.setTextColor(55, 65, 81);
  const lines = pdf.splitTextToSize(cleanText(value), width) as string[];
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function addSectionLabel(pdf: Pdf, label: string, y: number): number {
  pdf.setFillColor(24, 63, 87);
  pdf.rect(MARGIN_X, y, CONTENT_W, 7, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(255, 255, 255);
  pdf.text(cleanText(label), MARGIN_X + 3, y + 4.8);
  return y + 11;
}

function drawNote(pdf: Pdf, title: string, message: string, y = BODY_TOP + 15): void {
  pdf.setDrawColor(203, 213, 225);
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(MARGIN_X, y, CONTENT_W, 19, 2, 2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(55, 65, 81);
  pdf.text(cleanText(title), MARGIN_X + 4, y + 6);
  addWrapped(pdf, message, MARGIN_X + 4, y + 12, CONTENT_W - 8, 8, 4);
}

function formatLayerVisibility(layers: ReportInput["layers"]): string {
  const visible = [layers.mean && "mean", layers.max && "max", layers.min && "min", layers.trend && "trend line"].filter(Boolean);
  return visible.length ? visible.join(", ") : "no optional layers";
}

function addDecorations(pdf: Pdf, input: ReportInput, page: number, total: number): void {
  const result = input.result;
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.25);
  pdf.line(MARGIN_X, 13, PAGE_W - MARGIN_X, 13);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(31, 41, 55);
  pdf.text(cleanText(input.appName), MARGIN_X, 9);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(75, 85, 99);
  const context = `${input.placeName || coordinateText(result)} / ${input.quantity || result.label}`;
  pdf.text(cleanText(context), PAGE_W - MARGIN_X, 9, { align: "right" });
  pdf.line(MARGIN_X, PAGE_H - 10, PAGE_W - MARGIN_X, PAGE_H - 10);
  pdf.setFontSize(7.5);
  pdf.text(cleanText(`Generated ${new Date().toLocaleDateString("en-US")} / Page ${page} of ${total}`), MARGIN_X, PAGE_H - 5);
  pdf.text(cleanText(`${result.source} / ${result.coverage}`), PAGE_W - MARGIN_X, PAGE_H - 5, { align: "right" });
}

async function chartImage(element: Element | null, width: number, height: number): Promise<ImageDataUrl | null> {
  if (!element || !(element instanceof HTMLElement) || !element.classList.contains("js-plotly-plot")) return null;
  try {
    return await Plotly.toImage(element as HTMLElement, { format: "png", width, height, scale: 1 });
  } catch {
    return null;
  }
}

async function captureElement(element: HTMLElement, scale = 2): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  return html2canvas(element, {
    backgroundColor: "#ffffff",
    useCORS: true,
    allowTaint: false,
    scale,
    logging: false,
    imageTimeout: 15000,
  });
}

function addImageFit(pdf: Pdf, dataUrl: string, x: number, y: number, width: number, height: number): number {
  const ratio = width / height;
  const maxHeight = Math.min(height, BODY_BOTTOM - y);
  const drawHeight = Math.min(maxHeight, width / ratio);
  pdf.addImage(dataUrl, "PNG", x, y, width, drawHeight, undefined, "FAST");
  return y + drawHeight;
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => reject(new Error("image could not be decoded"));
    image.src = dataUrl;
  });
}

async function addChartSection(pdf: Pdf, title: string, chart: Element | null, input: ReportInput, note: string): Promise<void> {
  addPage(pdf, title);
  const y = BODY_TOP + 14;
  const image = await chartImage(chart, 1400, 700);
  if (!image) {
    drawNote(pdf, "Chart unavailable", "The visible chart could not be converted to a high-resolution image in this browser.", y);
    return;
  }
  const dimensions = await getImageDimensions(image);
  const height = Math.min(103, CONTENT_W * dimensions.height / dimensions.width);
  pdf.addImage(image, "PNG", MARGIN_X, y, CONTENT_W, height, undefined, "FAST");
  addWrapped(pdf, note, MARGIN_X, y + height + 8, CONTENT_W, 9, 4.5);
  progress(input, `${title} added`);
}

async function addMapSection(pdf: Pdf, pane: HTMLElement | null, input: ReportInput): Promise<void> {
  addPage(pdf, "Map");
  const y = BODY_TOP + 14;
  try {
    if (!pane) throw new Error("map pane is hidden");
    const body = (pane.querySelector(".leaflet-container") || pane.querySelector("[role=application]") || pane) as HTMLElement;
    const canvas = await captureElement(body, 2);
    const dataUrl = canvas.toDataURL("image/png");
    const height = Math.min(125, CONTENT_W * canvas.height / canvas.width);
    pdf.addImage(dataUrl, "PNG", MARGIN_X, y, CONTENT_W, height, undefined, "FAST");
    addWrapped(pdf, `Context map snapshot for ${coordinateText(input.result)}. Basemap tiles may be omitted when a tile server blocks cross-origin capture.`, MARGIN_X, y + height + 8, CONTENT_W, 9, 4.5);
  } catch {
    pdf.setDrawColor(148, 163, 184);
    pdf.setFillColor(248, 250, 252);
    pdf.rect(MARGIN_X, y, CONTENT_W, 90, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(55, 65, 81);
    pdf.text("Map snapshot unavailable", PAGE_W / 2, y + 38, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(cleanText(coordinateText(input.result)), PAGE_W / 2, y + 48, { align: "center" });
    pdf.text("Coordinates are preserved for reproducibility.", PAGE_W / 2, y + 56, { align: "center" });
  }
  progress(input, "Map added");
}

function makeClone(source: HTMLElement): { host: HTMLDivElement; clone: HTMLElement } {
  const scroll = source.querySelector<HTMLElement>(".analysis-scroll");
  if (!scroll) throw new Error("analysis content is not visible");
  const host = document.createElement("div");
  host.style.cssText = [
    "position:fixed", "left:-100000px", "top:0", "width:720px", "min-height:1px", "height:auto", "overflow:visible",
    "background:#ffffff", "color:#111827", "z-index:-1", "padding:24px", "box-sizing:border-box",
    "font-family:Cairo, Segoe UI, system-ui, Arial, sans-serif", "font-size:14px", "line-height:1.5",
  ].join(";");
  const clone = scroll.cloneNode(true) as HTMLElement;
  clone.style.cssText = "position:static;inset:auto;display:block;width:672px;height:auto;min-height:0;max-height:none;overflow:visible;overflow-y:visible;overflow-x:visible;scrollbar-gutter:auto;background:#fff;color:#111827;";
  clone.querySelectorAll("details").forEach((details) => { details.open = true; });
  clone.querySelectorAll("button,select,input").forEach((control) => control.remove());
  host.appendChild(clone);
  document.body.appendChild(host);
  return { host, clone };
}

async function replaceCloneCharts(original: HTMLElement, clone: HTMLElement): Promise<void> {
  const originalCharts = Array.from(original.querySelectorAll<HTMLElement>(".js-plotly-plot"));
  const clonedCharts = Array.from(clone.querySelectorAll<HTMLElement>(".js-plotly-plot"));
  await Promise.all(clonedCharts.map(async (clonedChart, index) => {
    const image = await chartImage(originalCharts[index] ?? null, 1200, 440);
    if (!image) {
      clonedChart.replaceWith(document.createTextNode("[Chart unavailable in PDF capture]"));
      return;
    }
    const imageElement = document.createElement("img");
    imageElement.src = image;
    imageElement.alt = "Chart from the analysis";
    imageElement.style.cssText = "display:block;width:100%;height:auto;background:#fff;margin:12px 0;";
    clonedChart.replaceWith(imageElement);
  }));
}

function blockBreaks(container: HTMLElement, pixelHeight: number): number[] {
  const top = container.getBoundingClientRect().top;
  const breaks = [0];
  let next = pixelHeight;
  Array.from(container.children).forEach((child) => {
    const box = (child as HTMLElement).getBoundingClientRect();
    const start = box.top - top;
    const end = box.bottom - top;
    if (end <= next + 1) return;
    if (start > breaks[breaks.length - 1] + 1 && start < next) {
      breaks.push(start);
      next = start + pixelHeight;
    } else if (start >= next) {
      breaks.push(start);
      next = start + pixelHeight;
    }
    if (end > next && end - start > pixelHeight) {
      while (end > next) { breaks.push(next); next += pixelHeight; }
    }
  });
  const total = container.getBoundingClientRect().height;
  while (breaks[breaks.length - 1] < total - 1) {
    const last = breaks[breaks.length - 1];
    const candidate = Math.min(last + pixelHeight, total);
    if (candidate === last) break;
    breaks.push(candidate);
  }
  return breaks;
}

function canvasSlice(canvas: HTMLCanvasElement, topCss: number, bottomCss: number, scale: number): HTMLCanvasElement {
  const top = Math.max(0, Math.round(topCss * scale));
  const bottom = Math.min(canvas.height, Math.round(bottomCss * scale));
  const slice = document.createElement("canvas");
  slice.width = canvas.width;
  slice.height = Math.max(1, bottom - top);
  const context = slice.getContext("2d");
  if (!context) throw new Error("canvas context unavailable");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, slice.width, slice.height);
  context.drawImage(canvas, 0, top, canvas.width, slice.height, 0, 0, slice.width, slice.height);
  return slice;
}

async function addAnalysisSection(pdf: Pdf, title: string, pane: HTMLElement | null, input: ReportInput): Promise<void> {
  progress(input, `Rendering ${title.toLowerCase()}...`);
  const source = pane?.querySelector<HTMLElement>(".analysis-scroll");
  if (!source) {
    addPage(pdf, title);
    drawNote(pdf, `${title} unavailable`, "This pane was hidden or has no rendered analysis content.");
    return;
  }
  const { host, clone } = makeClone(pane!);
  try {
    await replaceCloneCharts(source, clone);
    await document.fonts?.ready;
    const scale = 2;
    const canvas = await captureElement(host, scale);
    const cssWidth = host.getBoundingClientRect().width;
    const imageY = BODY_TOP + 12;
    const imageBodyHeight = BODY_BOTTOM - imageY;
    const pagePixelHeight = Math.max(220, (imageBodyHeight / CONTENT_W) * cssWidth);
    const breaks = blockBreaks(host, pagePixelHeight);
    for (let index = 0; index < breaks.length - 1; index += 1) {
      if (index === 0) addPage(pdf, title);
      else pdf.addPage("a4", "portrait");
      const from = breaks[index];
      const to = breaks[index + 1];
      const slice = canvasSlice(canvas, from, to, scale);
      const sliceUrl = slice.toDataURL("image/png");
      const height = CONTENT_W * slice.height / slice.width;
      pdf.addImage(sliceUrl, "PNG", MARGIN_X, imageY, CONTENT_W, Math.min(imageBodyHeight, height), undefined, "FAST");
    }
    progress(input, `${title} added`);
  } finally {
    host.remove();
  }
}

function addSummary(pdf: Pdf, input: ReportInput): void {
  const result = input.result;
  const trend = result.trend;
  const prediction = result.prediction;
  pdf.setTextColor(24, 63, 87);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text(cleanText(`${input.appName} report`), MARGIN_X, BODY_TOP + 10);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(71, 85, 105);
  pdf.text(cleanText(`${input.placeName || "Selected location"} / ${coordinateText(result)}`), MARGIN_X, BODY_TOP + 18);
  pdf.text(cleanText(`${input.quantity || result.label} / NASA code ${result.param} / Unit ${result.unit}`), MARGIN_X, BODY_TOP + 24);

  let y = BODY_TOP + 34;
  y = addSectionLabel(pdf, "Analysis summary", y);
  const summaryRows = [
    ["Period", `${input.start}-${input.end}`],
    ["Significance level", `alpha = ${number(input.alpha, 3)}`],
    ["Role", input.roleTitle],
    ["Data source", `${result.source}; coverage ${result.coverage}`],
    ["Data completeness", `${number(result.data_coverage.n_valid_months, 0)} of ${number(result.data_coverage.n_input_months, 0)} expected months valid (${result.data_coverage.fraction_valid == null ? "not available" : `${number(result.data_coverage.fraction_valid * 100, 1)}%`}); ${result.data_coverage.n_complete_years} complete years`],
  ];
  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    tableWidth: CONTENT_W,
    head: [["Field", "Value"]],
    body: summaryRows.map(([field, value]) => [cleanText(field), cleanText(value)]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.2, textColor: [55, 65, 81] },
    headStyles: { fillColor: [24, 63, 87], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 43, fontStyle: "bold" }, 1: { cellWidth: CONTENT_W - 43 } },
  });
  y = ((pdf as Pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 36) + 8;
  y = addSectionLabel(pdf, "Key findings", y);
  const lastPrediction = prediction.available ? prediction.years[prediction.years.length - 1] : null;
  const keyRows = [
    ["Change per decade", trend ? `${signed(trend.change_per_decade)} ${result.unit}` : "not available"],
    ["Total fitted change", trend ? `${signed(trend.total_change)} ${result.unit}` : "not available"],
    ["Significance", trend ? `${trend.significant ? "Significant monotonic trend" : "Not significant"}; ${pValue(trend.mk_p)}` : "trend not available"],
    ["Mean annual summary", trend ? `${number(trend.mean)} ${result.unit}` : "not available"],
    ["Seasonal peak", result.seasonality.peak_month && result.seasonality.peak_value != null ? `${MONTHS[result.seasonality.peak_month - 1]} / ${number(result.seasonality.peak_value)} ${result.unit}` : "not available"],
    ["Seasonal trough", result.seasonality.trough_month && result.seasonality.trough_value != null ? `${MONTHS[result.seasonality.trough_month - 1]} / ${number(result.seasonality.trough_value)} ${result.unit}` : "not available"],
    ["Last horizon prediction", lastPrediction ? `${lastPrediction.year}: ${number(lastPrediction.value)} ${result.unit} [${number(lastPrediction.lower)}, ${number(lastPrediction.upper)}]` : "prediction not available"],
    ["Hindcast RMSE", prediction.hindcast ? `linear ${number(prediction.hindcast.rmse_linear)} / persistence ${number(prediction.hindcast.rmse_persistence)} ${result.unit}` : "not available"],
  ];
  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    tableWidth: CONTENT_W,
    head: [["Finding", "Result"]],
    body: keyRows.map(([field, value]) => [cleanText(field), cleanText(value)]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.2, cellPadding: 2.2, textColor: [55, 65, 81] },
    headStyles: { fillColor: [67, 133, 155], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 43, fontStyle: "bold" }, 1: { cellWidth: CONTENT_W - 43 } },
  });
}

function addAppendixTables(pdf: Pdf, input: ReportInput): void {
  const result = input.result;
  addPage(pdf, "Appendix / data tables");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(24, 63, 87);
  pdf.text("Annual data", MARGIN_X, BODY_TOP + 14);
  autoTable(pdf, {
    startY: BODY_TOP + 19,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [["Year", `Summary (${cleanText(result.unit)})`, `Min (${cleanText(result.unit)})`, `Max (${cleanText(result.unit)})`, "Months", "Complete"]],
    body: result.annual.map((row) => [row.year, number(row.value), number(row.min), number(row.max), row.n_months, row.complete_12_months ? "yes" : "no"]),
    theme: "striped",
    styles: { font: "helvetica", fontSize: 6.6, cellPadding: 1.5, textColor: [55, 65, 81] },
    headStyles: { fillColor: [24, 63, 87], textColor: [255, 255, 255], fontSize: 6.6 },
  });
  const annualEnd = (pdf as Pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? BODY_TOP + 60;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(24, 63, 87);
  const monthlyHeadingY = annualEnd + 12 > BODY_BOTTOM - 15 ? BODY_TOP + 14 : annualEnd + 12;
  if (monthlyHeadingY === BODY_TOP + 14) pdf.addPage("a4", "portrait");
  pdf.text("Monthly data", MARGIN_X, monthlyHeadingY);
  autoTable(pdf, {
    startY: monthlyHeadingY + 5,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [["Date", `Value (${cleanText(result.unit)})`, `Centered 12-month mean (${cleanText(result.unit)})`, "Z-score"]],
    body: result.monthly.map((row) => [row.date, row.value == null ? "missing" : number(row.value), row.running == null ? "not available" : number(row.running), row.z == null ? "not available" : number(row.z)]),
    theme: "striped",
    styles: { font: "helvetica", fontSize: 6.6, cellPadding: 1.5, textColor: [55, 65, 81] },
    headStyles: { fillColor: [67, 133, 155], textColor: [255, 255, 255], fontSize: 6.6 },
  });
  progress(input, "Appendix tables added");
}

export async function exportReportPdf(input: ReportInput): Promise<void> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", putOnlyUsedFonts: true, compress: true });
  const reportTitle = `${input.appName} report`;
  progress(input, "Preparing PDF report...");
  try {
    addSummary(pdf, input);
    progress(input, "Summary added");
  } catch (error) {
    drawNote(pdf, "Summary unavailable", error instanceof Error ? error.message : "The summary could not be rendered.");
  }

  const sections: Array<() => Promise<void>> = [
    () => addChartSection(pdf, "Time series", input.panes.series?.querySelector("#plot-series, .js-plotly-plot") ?? null, input, `Visible layers: ${formatLayerVisibility(input.layers)}.`),
    () => addMapSection(pdf, input.panes.map, input),
    () => addAnalysisSection(pdf, "Trend and prediction", input.panes.trend, input),
    () => addAnalysisSection(pdf, "Deep analysis", input.panes.deep, input),
  ];
  for (const section of sections) {
    try { await section(); }
    catch (error) {
      const message = error instanceof Error ? error.message : "This section could not be rendered.";
      pdf.addPage("a4", "portrait");
      drawNote(pdf, "Section rendering note", message);
    }
  }
  try { addAppendixTables(pdf, input); }
  catch (error) { drawNote(pdf, "Appendix unavailable", error instanceof Error ? error.message : "The data tables could not be rendered."); }

  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page);
    addDecorations(pdf, input, page, total);
  }
  progress(input, "Downloading PDF...");
  pdf.save(`${safeFileName(input.fileName)}.pdf`);
  progress(input, `${reportTitle} downloaded`);
}
