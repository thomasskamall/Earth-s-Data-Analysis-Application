// Draws one frame of the explainer video on a 1280 × 720 canvas.
import { fmt, signed } from "../components/format";
import { MONTHS, sceneAt, type Scene, type Story } from "./story";

export const W = 1280;
export const H = 720;
type Ctx = CanvasRenderingContext2D;
type Rect = { x: number; y: number; w: number; h: number };
const font = (size: number, weight = 700) => `${weight} ${size}px Cairo, "Segoe UI", "Segoe UI Emoji", sans-serif`;
const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
const INK = "#2d2350";
const SOFT = "#7a7299";

function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrap(ctx: Ctx, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
function chip(ctx: Ctx, text: string, x: number, y: number, color: string, size = 20) {
  ctx.font = font(size, 700);
  const w = ctx.measureText(text).width + 30;
  ctx.fillStyle = color;
  rounded(ctx, x, y, w, size + 18, (size + 18) / 2);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 15, y + (size + 18) / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return w;
}

function background(ctx: Ctx, scene: Scene, t: number) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, scene.colors[0]);
  g.addColorStop(1, scene.colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) {
    const x = (i * 173 + Math.sin(t * 0.4 + i) * 40) % W;
    const y = (i * 97 + Math.cos(t * 0.3 + i * 2) * 30 + 60) % H;
    ctx.fillStyle = `rgba(255,255,255,${0.06 + (i % 3) * 0.03})`;
    ctx.beginPath();
    ctx.arc(x, y, 30 + (i % 4) * 26, 0, Math.PI * 2);
    ctx.fill();
  }
}

type Axis = { x0: number; x1: number; y0: number; y1: number };
function scales(rect: Rect, axis: Axis) {
  const pad = { l: 86, r: 40, t: 34, b: 52 };
  const sx = (x: number) => rect.x + pad.l + ((x - axis.x0) / (axis.x1 - axis.x0 || 1)) * (rect.w - pad.l - pad.r);
  const sy = (y: number) => rect.y + rect.h - pad.b - ((y - axis.y0) / (axis.y1 - axis.y0 || 1)) * (rect.h - pad.t - pad.b);
  return { sx, sy, pad };
}
function niceRange(values: number[], extra = 0.12): [number, number] {
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || Math.abs(hi) || 1;
  return [lo - span * extra, hi + span * extra];
}
function axes(ctx: Ctx, rect: Rect, axis: Axis, unit: string, xLabels: [number, string][]) {
  const { sx, sy, pad } = scales(rect, axis);
  ctx.strokeStyle = "#ece8f8";
  ctx.lineWidth = 2;
  ctx.font = font(17, 600);
  ctx.fillStyle = SOFT;
  ctx.textAlign = "right";
  for (let i = 0; i <= 3; i++) {
    const value = axis.y0 + ((axis.y1 - axis.y0) * i) / 3;
    const y = sy(value);
    ctx.beginPath(); ctx.moveTo(rect.x + pad.l, y); ctx.lineTo(rect.x + rect.w - pad.r, y); ctx.stroke();
    ctx.fillText(fmt(value), rect.x + pad.l - 12, y + 6);
  }
  ctx.textAlign = "left";
  ctx.fillText(unit, rect.x + 18, rect.y + 26);
  ctx.textAlign = "center";
  for (const [x, label] of xLabels) ctx.fillText(label, sx(x), rect.y + rect.h - 18);
  ctx.textAlign = "left";
  return { sx, sy };
}
function polyline(ctx: Ctx, points: [number, number][], color: string, width: number, upTo = 1, dash: number[] = []) {
  const n = Math.max(1, Math.floor(points.length * clamp01(upTo)));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash(dash);
  ctx.beginPath();
  points.slice(0, n).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.setLineDash([]);
  return n;
}
function dot(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke();
}
function label(ctx: Ctx, text: string, x: number, y: number, color: string) {
  ctx.font = font(18, 700);
  const w = ctx.measureText(text).width + 20;
  const left = Math.min(Math.max(x - w / 2, 80), W - 80 - w);
  ctx.fillStyle = color;
  rounded(ctx, left, y - 32, w, 28, 14); ctx.fill();
  ctx.fillStyle = "white"; ctx.fillText(text, left + 10, y - 12);
}

// ---------- scene visuals ----------
function globe(ctx: Ctx, story: Story, lt: number, cx: number, cy: number, R: number) {
  const { lat, lon } = story.result;
  const rad = Math.PI / 180;
  const lon0 = (lon - 120 * (1 - ease(lt / 2.6))) * rad, lat0 = lat * 0.6 * rad;
  const project = (la: number, lo: number): [number, number] | null => {
    const p = la * rad, l = lo * rad;
    const cosc = Math.sin(lat0) * Math.sin(p) + Math.cos(lat0) * Math.cos(p) * Math.cos(l - lon0);
    if (cosc < 0) return null;
    return [cx + R * Math.cos(p) * Math.sin(l - lon0), cy - R * (Math.cos(lat0) * Math.sin(p) - Math.sin(lat0) * Math.cos(p) * Math.cos(l - lon0))];
  };
  const ocean = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
  ocean.addColorStop(0, "#7fdcff"); ocean.addColorStop(1, "#1b6fd8");
  ctx.fillStyle = ocean; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1.5;
  const trace = (pts: ([number, number] | null)[]) => {
    ctx.beginPath(); let down = false;
    for (const p of pts) { if (!p) { down = false; continue; } if (down) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); down = true; } }
    ctx.stroke();
  };
  for (let lo = -180; lo < 180; lo += 30) trace(Array.from({ length: 61 }, (_, i) => project(-90 + i * 3, lo)));
  for (let la = -60; la <= 60; la += 30) trace(Array.from({ length: 121 }, (_, i) => project(la, -180 + i * 3)));
  const pin = project(lat, lon);
  if (pin && lt > 2.2) {
    const pulse = (lt * 1.2) % 1;
    ctx.strokeStyle = `rgba(255,214,0,${1 - pulse})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(pin[0], pin[1], 10 + pulse * 34, 0, Math.PI * 2); ctx.stroke();
    dot(ctx, pin[0], pin[1], 11, "#ff3d71");
  }
}
function intro(ctx: Ctx, story: Story, rect: Rect, lt: number) {
  globe(ctx, story, lt, rect.x + 220, rect.y + rect.h / 2, 150);
  const x = rect.x + 440;
  const k = ease((lt - 0.6) / 1);
  ctx.globalAlpha = k;
  ctx.fillStyle = INK; ctx.font = font(46, 800);
  wrap(ctx, story.place, rect.w - 480).slice(0, 2).forEach((line, i) => ctx.fillText(line, x, rect.y + 95 + i * 56));
  const r = story.result;
  ctx.fillStyle = SOFT; ctx.font = font(24, 600);
  ctx.fillText(`${Math.abs(r.lat).toFixed(2)}° ${r.lat >= 0 ? "N" : "S"}   ${Math.abs(r.lon).toFixed(2)}° ${r.lon >= 0 ? "E" : "W"}`, x, rect.y + 200);
  const years = r.annual.length ? `${r.annual[0].year}–${r.annual[r.annual.length - 1].year}` : "";
  const w = chip(ctx, story.quantity, x, rect.y + 236, "#6d4aff", 22);
  chip(ctx, `NASA POWER ${years}`, x + w + 12, rect.y + 236, "#1fb6ff", 22);
  ctx.globalAlpha = 1;
}
function concept(ctx: Ctx, story: Story, scene: Scene, rect: Rect, lt: number) {
  ctx.font = font(150, 400);
  ctx.textAlign = "center";
  ctx.fillText(scene.icon, rect.x + 210, rect.y + rect.h / 2 + 52 + Math.sin(lt * 2) * 10);
  ctx.textAlign = "left";
  const r = story.result;
  const x = rect.x + 420;
  ctx.fillStyle = INK; ctx.font = font(38, 800);
  wrap(ctx, r.label, rect.w - 460).slice(0, 2).forEach((line, i) => ctx.fillText(line, x, rect.y + 100 + i * 48));
  const k = ease((lt - 0.8) / 0.8);
  ctx.globalAlpha = k;
  let cx = x;
  if (r.unit && r.unit !== "1") cx += chip(ctx, `Unit: ${r.unit.replace("^2", "²")}`, cx, rect.y + 200, "#ff7a59") + 12;
  else cx += chip(ctx, "Scale: 0 (dry) to 1 (full)", cx, rect.y + 200, "#ff7a59") + 12;
  chip(ctx, `NASA code: ${r.param}`, cx, rect.y + 200, "#e84393");
  chip(ctx, "One value per month, for a grid cell tens of km wide", x, rect.y + 256, "#00b894");
  ctx.globalAlpha = 1;
}
function seasons(ctx: Ctx, story: Story, rect: Rect, lt: number) {
  const clim = story.result.climatology;
  const values = clim.map((row) => row.mean ?? 0);
  const lo = Math.min(...values), hi = Math.max(...values);
  const base = lo >= 0 && lo < hi * 0.5 ? 0 : lo - (hi - lo) * 0.3;
  const top = hi + (hi - lo) * 0.25;
  const { sy } = axes(ctx, rect, { x0: 0, x1: 12, y0: base, y1: top }, story.result.unit === "1" ? "index" : story.result.unit.replace("^2", "²"), []);
  const left = rect.x + 86, width = rect.w - 126, step = width / 12;
  const s = story.result.seasonality;
  clim.forEach((row, i) => {
    const k = ease((lt - 0.3 - i * 0.12) / 0.7);
    const value = row.mean ?? base;
    const frac = (value - lo) / (hi - lo || 1);
    const color = `hsl(${210 - frac * 190}, 85%, ${58 - frac * 6}%)`;
    const y = sy(base + (value - base) * k);
    const x = left + i * step + step * 0.15;
    ctx.fillStyle = color;
    rounded(ctx, x, y, step * 0.7, Math.max(2, sy(base) - y), 10); ctx.fill();
    ctx.fillStyle = SOFT; ctx.font = font(17, 700); ctx.textAlign = "center";
    ctx.fillText(MONTHS[i].slice(0, 3), x + step * 0.35, rect.y + rect.h - 18);
    ctx.textAlign = "left";
    if (k >= 1 && (row.month === s.peak_month || row.month === s.trough_month)) {
      label(ctx, `${row.month === s.peak_month ? "★ " : ""}${fmt(value)}`, x + step * 0.35, y - 6, row.month === s.peak_month ? "#ff7a59" : "#1f8fff");
    }
  });
}
function annualPoints(story: Story) {
  return story.result.annual.filter((row) => row.complete_12_months).map((row) => [row.year, row.value] as [number, number]);
}
function history(ctx: Ctx, story: Story, scene: Scene, rect: Rect, lt: number, showTrend: boolean) {
  const rows = annualPoints(story);
  const t = story.result.trend;
  const x0 = rows[0][0], x1 = rows[rows.length - 1][0];
  const [y0, y1] = niceRange(rows.map((row) => row[1]));
  const { sx, sy } = axes(ctx, rect, { x0, x1, y0, y1 }, story.result.unit.replace("^2", "²"), [[x0, String(x0)], [Math.round((x0 + x1) / 2), String(Math.round((x0 + x1) / 2))], [x1, String(x1)]]);
  const pts = rows.map(([x, y]) => [sx(x), sy(y)] as [number, number]);
  const reveal = showTrend ? 1 : ease(lt / (scene.duration * 0.55));
  const n = polyline(ctx, pts, showTrend ? "#c9c1ea" : "#6d4aff", 4, reveal);
  pts.slice(0, n).forEach(([x, y]) => dot(ctx, x, y, 6, showTrend ? "#b3a8e6" : "#6d4aff"));
  if (!showTrend && reveal >= 1) {
    const hi = rows.reduce((a, b) => (b[1] > a[1] ? b : a));
    const lo = rows.reduce((a, b) => (b[1] < a[1] ? b : a));
    label(ctx, `${hi[0]} highest`, sx(hi[0]), sy(hi[1]) - 10, "#ff7a59");
    label(ctx, `${lo[0]} lowest`, sx(lo[0]), sy(lo[1]) + 46, "#1f8fff");
  }
  if (showTrend && t) {
    const k = ease((lt - 0.5) / 2.2);
    const xa = t.first_year, xb = t.first_year + (t.last_year - t.first_year) * k;
    polyline(ctx, [[sx(xa), sy(t.sen_intercept + t.sen_slope * xa)], [sx(xb), sy(t.sen_intercept + t.sen_slope * xb)]], "#e84393", 7);
    if (k >= 1) {
      const u = story.result.unit === "1" ? "" : ` ${story.result.unit.replace("^2", "²")}`;
      const text = t.significant ? `${signed(t.change_per_decade)}${u} every 10 years` : "No clear trend";
      ctx.font = font(30, 800);
      const w = ctx.measureText(text).width + 44;
      ctx.fillStyle = t.significant ? "#e84393" : "#636e72";
      rounded(ctx, rect.x + rect.w - w - 30, rect.y + 24, w, 54, 27); ctx.fill();
      ctx.fillStyle = "white"; ctx.fillText(text, rect.x + rect.w - w - 8, rect.y + 62);
    }
  }
}
function future(ctx: Ctx, story: Story, rect: Rect, lt: number) {
  const rows = annualPoints(story).slice(-25);
  const pred = story.result.prediction.years;
  const x0 = rows[0][0], x1 = pred[pred.length - 1].year;
  const [y0, y1] = niceRange([...rows.map((row) => row[1]), ...pred.map((row) => row.lower), ...pred.map((row) => row.upper)], 0.08);
  const { sx, sy } = axes(ctx, rect, { x0, x1, y0, y1 }, story.result.unit.replace("^2", "²"), [[x0, String(x0)], [rows[rows.length - 1][0], String(rows[rows.length - 1][0])], [x1, String(x1)]]);
  const pts = rows.map(([x, y]) => [sx(x), sy(y)] as [number, number]);
  polyline(ctx, pts, "#6d4aff", 4);
  pts.forEach(([x, y]) => dot(ctx, x, y, 5, "#6d4aff"));
  const k = ease((lt - 0.6) / 2);
  const lastObs = rows[rows.length - 1];
  const shown = pred.filter((row) => row.year <= lastObs[0] + (x1 - lastObs[0]) * k + 0.001);
  if (shown.length) {
    ctx.fillStyle = "rgba(162,155,254,0.35)";
    ctx.beginPath();
    ctx.moveTo(sx(lastObs[0]), sy(lastObs[1]));
    shown.forEach((row) => ctx.lineTo(sx(row.year), sy(row.upper)));
    [...shown].reverse().forEach((row) => ctx.lineTo(sx(row.year), sy(row.lower)));
    ctx.closePath(); ctx.fill();
    polyline(ctx, [[sx(lastObs[0]), sy(lastObs[1])], ...shown.map((row) => [sx(row.year), sy(row.value)] as [number, number])], "#ff7a59", 4, 1, [10, 10]);
    shown.forEach((row) => dot(ctx, sx(row.year), sy(row.value), 6, "#ff7a59"));
    if (k >= 1) { const end = pred[pred.length - 1]; label(ctx, `${end.year}: about ${fmt(end.value)}`, sx(end.year) - 60, sy(end.upper) - 6, "#ff7a59"); }
  }
  ctx.strokeStyle = "#d8d2ef"; ctx.setLineDash([6, 8]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx(lastObs[0]), rect.y + 30); ctx.lineTo(sx(lastObs[0]), rect.y + rect.h - 52); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = font(17, 700); ctx.fillStyle = SOFT; ctx.fillText("today", sx(lastObs[0]) + 8, rect.y + 48);
}
function surprise(ctx: Ctx, story: Story, rect: Rect, lt: number) {
  const months = story.result.monthly.filter((row) => row.value !== null);
  if (!months.length) return;
  const time = (date: string) => Number(date.slice(0, 4)) + (Number(date.slice(5, 7)) - 0.5) / 12;
  const x0 = time(months[0].date), x1 = time(months[months.length - 1].date);
  const [y0, y1] = niceRange(months.map((row) => row.value!), 0.1);
  const { sx, sy } = axes(ctx, rect, { x0, x1, y0, y1 }, story.result.unit.replace("^2", "²"), [[x0, months[0].date.slice(0, 4)], [x1, months[months.length - 1].date.slice(0, 4)]]);
  polyline(ctx, months.map((row) => [sx(time(row.date)), sy(row.value!)] as [number, number]), "#b9b2d6", 1.6);
  const extremes = story.result.extremes;
  const pulse = 1 + 0.25 * Math.sin(lt * 5);
  extremes.forEach((row, i) => { if (lt > 0.4 + i * 0.05) dot(ctx, sx(time(row.date)), sy(row.value), 7 * pulse, row.z > 0 ? "#e17055" : "#0984e3"); });
  const top = [...extremes].sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0];
  if (top && lt > 1.5) label(ctx, `${MONTHS[Number(top.date.slice(5, 7)) - 1].slice(0, 3)} ${top.date.slice(0, 4)}`, sx(time(top.date)), sy(top.value) - 14, top.z > 0 ? "#e17055" : "#0984e3");
}
function outro(ctx: Ctx, story: Story, rect: Rect, lt: number) {
  const r = story.result;
  const u = r.unit === "1" ? "" : ` ${r.unit.replace("^2", "²")}`;
  const complete = r.annual.filter((row) => row.complete_12_months);
  const mean = r.trend?.mean ?? (complete.length ? complete.reduce((a, b) => a + b.value, 0) / complete.length : null);
  const tiles: [string, string, string][] = [
    ["Typical year", `${fmt(mean)}${u}`, "#6d4aff"],
    ["Change per 10 years", r.trend ? (r.trend.significant ? `${signed(r.trend.change_per_decade)}${u}` : "Not clear") : "Need more years", "#e84393"],
    ["Seasonal swing", `${fmt(r.seasonality.amplitude)}${u}`, "#00b894"],
  ];
  const w = (rect.w - 120) / 3;
  tiles.forEach(([title, value, color], i) => {
    const k = ease((lt - i * 0.35) / 0.7);
    const x = rect.x + 30 + i * (w + 30), y = rect.y + 70 + (1 - k) * 40;
    ctx.globalAlpha = k;
    ctx.fillStyle = color; rounded(ctx, x, y, w, 200, 24); ctx.fill();
    ctx.fillStyle = "white"; ctx.font = font(24, 700); ctx.fillText(title, x + 26, y + 52);
    ctx.font = font(value.length > 12 ? 34 : 44, 800); ctx.fillText(value, x + 26, y + 130);
    ctx.globalAlpha = 1;
  });
  for (let i = 0; i < 40; i++) {
    const x = rect.x + ((i * 97) % rect.w);
    const y = rect.y + ((lt * (60 + (i % 5) * 25) + i * 37) % rect.h);
    ctx.fillStyle = ["#ff7a59", "#6d4aff", "#00b894", "#ffd43b", "#e84393"][i % 5];
    ctx.save(); ctx.translate(x, y); ctx.rotate(lt * 2 + i); ctx.fillRect(-5, -3, 10, 6); ctx.restore();
  }
}

// ---------- frame ----------
export function captionFor(scene: Scene, lt: number): number {
  const words = scene.speech.map((line) => line.split(/\s+/).length);
  const total = words.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < words.length; i++) {
    acc += words[i];
    if (lt / scene.duration < acc / total) return i;
  }
  return words.length - 1;
}

export function drawFrame(ctx: Ctx, story: Story, time: number, caption?: number) {
  const index = sceneAt(story, time);
  const scene = story.scenes[index];
  const lt = Math.max(0, time - scene.start);
  ctx.clearRect(0, 0, W, H);
  background(ctx, scene, time);

  // brand and scene dots
  ctx.font = font(20, 800); ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText("Earth's Data Analysis Application · Data story", 70, 54);
  story.scenes.forEach((_, i) => {
    ctx.fillStyle = i === index ? "white" : "rgba(255,255,255,0.4)";
    ctx.beginPath(); ctx.arc(W - 70 - (story.scenes.length - 1 - i) * 26, 48, i === index ? 8 : 6, 0, Math.PI * 2); ctx.fill();
  });

  // title
  const enter = ease(lt / 0.7);
  ctx.globalAlpha = enter;
  ctx.fillStyle = "white"; ctx.font = font(50, 800);
  ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = 12;
  ctx.fillText(`${scene.icon}  ${scene.title}`, 70 - (1 - enter) * 40, 128);
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;

  // white card with the visual
  const pop = ease(lt / 0.6);
  const rect: Rect = { x: 70, y: 160, w: W - 140, h: 380 };
  ctx.save();
  ctx.translate(W / 2, rect.y + rect.h / 2); ctx.scale(0.94 + 0.06 * pop, 0.94 + 0.06 * pop); ctx.translate(-W / 2, -(rect.y + rect.h / 2));
  ctx.globalAlpha = pop;
  ctx.shadowColor = "rgba(40,20,90,0.25)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
  ctx.fillStyle = "white"; rounded(ctx, rect.x, rect.y, rect.w, rect.h, 28); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.save(); rounded(ctx, rect.x, rect.y, rect.w, rect.h, 28); ctx.clip();
  const hasAnnual = annualPoints(story).length >= 2;
  if (scene.kind === "intro") intro(ctx, story, rect, lt);
  else if (scene.kind === "concept") concept(ctx, story, scene, rect, lt);
  else if (scene.kind === "seasons") seasons(ctx, story, rect, lt);
  else if (scene.kind === "history" && hasAnnual) history(ctx, story, scene, rect, lt, false);
  else if (scene.kind === "trend" && hasAnnual) history(ctx, story, scene, rect, lt, true);
  else if (scene.kind === "future" && hasAnnual) future(ctx, story, rect, lt);
  else if (scene.kind === "surprise") surprise(ctx, story, rect, lt);
  else if (scene.kind === "outro") outro(ctx, story, rect, lt);
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = 1;

  // caption
  const line = scene.captions[caption ?? captionFor(scene, lt)] ?? "";
  let size = 28;
  ctx.font = font(size, 700);
  let lines = wrap(ctx, line, W - 220);
  if (lines.length > 2) { size = 24; ctx.font = font(size, 700); lines = wrap(ctx, line, W - 220); }
  const boxH = lines.length * (size + 12) + 30;
  ctx.fillStyle = "rgba(20,12,50,0.62)";
  rounded(ctx, 70, H - 40 - boxH, W - 140, boxH, 22); ctx.fill();
  ctx.fillStyle = "white";
  lines.forEach((text, i) => ctx.fillText(text, 110, H - 40 - boxH + 15 + (i + 1) * (size + 12) - 8));

  // progress bar
  ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillRect(0, H - 8, W, 8);
  ctx.fillStyle = "white"; ctx.fillRect(0, H - 8, (W * time) / story.total, 8);
  ctx.font = font(15, 700); ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.textAlign = "right";
  ctx.fillText("Data: NASA POWER · power.larc.nasa.gov", W - 70, H - 16);
  ctx.textAlign = "left";
}
