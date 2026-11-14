import { useEffect, useLayoutEffect, useState } from "react";
import { TerraAvatar } from "./Terra";

type Step = { selector: string; title: string; simple: string; science: string };

const STEPS: Step[] = [
  { selector: ".toolbar-row", title: "1 · Choose where, what and when", simple: "Search a city (or click the map), pick what you want to explore, and choose the years.", science: "Set the location, NASA POWER parameter, analysis period and significance level α." },
  { selector: ".pane-series", title: "2 · How it changes over time", simple: "The purple line is the average of the last 12 months. The shaded band shows each year's lowest and highest month. The dashed line is the long-term trend. Use the checkboxes to show or hide them.", science: "Centered 12-month mean, annual Max–Min ribbon of monthly values and the Theil–Sen trend. Toggle layers in the header." },
  { selector: ".pane-map", title: "3 · Pick a place on Earth", simple: "Click anywhere on the map to explore that place. Switch to the topographic map to see mountains and valleys.", science: "Geographic context map with graticule and selection marker. Values represent a reanalysis grid cell, not a station." },
  { selector: ".pane-trend", title: "4 · Trend and future", simple: "Is it really changing? Here you see the trend, whether it is “real” (significant), a careful look into the future, and all the math step by step.", science: "Mann–Kendall significance, Sen's slope, OLS conditional extrapolation with prediction intervals, hindcast skill and the full derivations." },
  { selector: ".pane-deep", title: "5 · What it means", simple: "The science behind the numbers: what this measurement is, why it changes with the seasons, and the laws of physics involved.", science: "Physical interpretation, governing laws and caveats about reanalysis data and attribution." },
  { selector: ".terra-fab", title: "6 · I'm always here!", simple: "Click me any time for the data video, a quiz, the glossary, a PDF report, or to ask me questions.", science: "Open Terra for the explainer video, chat tutor, glossary, quiz, facts and PDF export." },
];

export default function Tour({ simple, onClose }: { simple: boolean; onClose: () => void }) {
  const steps = STEPS.filter((s) => document.querySelector(s.selector));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[Math.min(index, steps.length - 1)];

  useLayoutEffect(() => {
    const measure = () => setRect(step ? document.querySelector(step.selector)?.getBoundingClientRect() ?? null : null);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose, steps.length]);
  if (!step || !rect) return null;

  const pad = 6;
  const bubbleW = Math.min(360, window.innerWidth - 24);
  const below = rect.bottom + 200 < window.innerHeight;
  const top = below ? rect.bottom + 14 : Math.max(12, rect.top - 14 - 190);
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - bubbleW / 2), window.innerWidth - bubbleW - 12);
  const last = index >= steps.length - 1;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      <div className="tour-bubble" style={{ top, left, width: bubbleW }}>
        <div className="tour-head"><TerraAvatar size={40} mood="talk" /><h3>{step.title}</h3></div>
        <p>{simple ? step.simple : step.science}</p>
        <div className="tour-actions">
          <span>{index + 1} / {steps.length}</span>
          <button type="button" className="tour-skip" onClick={onClose}>Skip</button>
          <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</button>
          <button type="button" className="primary" onClick={() => (last ? onClose() : setIndex(index + 1))}>{last ? "Done 🎉" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
