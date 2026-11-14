import { useEffect, useRef } from "react";
import Plotly from "plotly.js-basic-dist-min";

const AXIS = {
  showline: true,
  mirror: true,          // a full box around the plot, like MATLAB
  linecolor: "#6b7280",
  gridcolor: "#e5e7eb",
  zeroline: false,
  ticks: "outside",
  tickcolor: "#6b7280",
  automargin: true,
};

type Props = {
  id: string;
  traces: object[];
  xTitle: string;
  yTitle: string;
  xaxis?: object;
};

/** A chart. Drag to zoom, double-click to reset, camera icon saves a PNG. */
export default function Plot({ id, traces, xTitle, yTitle, xaxis }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    Plotly.react(
      el,
      traces,
      {
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        font: { family: "Cairo, Segoe UI, system-ui, Arial, sans-serif", size: 11, color: "#1f2937" },
        margin: { l: 56, r: 14, t: 54, b: 40 },
        showlegend: true,
        legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { size: 10 } },
        hovermode: "x unified",
        xaxis: { ...AXIS, title: { text: xTitle }, ...xaxis },
        yaxis: { ...AXIS, title: { text: yTitle } },
      },
      { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"], toImageButtonOptions: { filename: id, scale: 2 } },
    );
  }, [traces, xTitle, yTitle, xaxis, id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => Plotly.Plots.resize(el));
    observer.observe(el);
    return () => {
      observer.disconnect();
      Plotly.purge(el);
    };
  }, []);

  return <div id={id} ref={ref} className="absolute inset-0" />;
}

export function savePng(id: string, filename: string) {
  const el = document.getElementById(id);
  if (el) Plotly.downloadImage(el, { format: "png", filename, width: 1400, height: 700, scale: 2 });
}
