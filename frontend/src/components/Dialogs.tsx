import { useEffect, useState, type ReactNode } from "react";
import { getHealth, type Health } from "../api/client";

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/30 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-full w-full max-w-xl flex-col border border-rule bg-paper shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center border-b border-rule bg-shell px-3 py-1.5">
          <h2 className="flex-1 font-semibold">{title}</h2>
          <button type="button" className="btn px-2" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

const SOURCES: { group: string; items: [string, string, string][] }[] = [
  {
    group: "Used by this app now",
    items: [
      ["NASA POWER", "https://power.larc.nasa.gov/docs/services/api/", "All measurements in this version. No key needed."],
      ["Esri basemaps", "https://server.arcgisonline.com/ArcGIS/rest/services/", "Labeled 2D geographic context; not a climate heatmap."],
      ["Open-Meteo geocoding", "https://open-meteo.com/en/docs/geocoding-api", "City search."],
      ["NASA POWER methodology", "https://power.larc.nasa.gov/docs/methodology/", "Variable definitions, source grids, units and limitations."],
      ["SciPy Theil–Sen", "https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html", "Robust slope and confidence bounds."],
      ["Mann–Kendall", "https://search.r-project.org/CRAN/refmans/trend/html/mk.test.html", "Tie correction and two-sided continuity-corrected test."],
      ["Prediction intervals", "https://online.stat.psu.edu/stat462/node/151/", "Student-t interval for conditional OLS extrapolation."],
    ],
  },
  {
    group: "NASA tools to check a result or get more data",
    items: [
      ["Giovanni", "https://giovanni.gsfc.nasa.gov/", "Menus of many variables; makes and downloads time series."],
      ["Hydrology Time Series", "https://disc.gsfc.nasa.gov/information/tools?title=Hydrology%20Time%20Series", "Time series of hydrological data."],
      ["AppEEARS", "https://appeears.earthdatacloud.nasa.gov/", "Point and area samples from many satellite archives."],
      ["Climate Data Online (NOAA)", "https://www.ncei.noaa.gov/cdo-web/", "Weather-station records, useful to compare with the model values."],
    ],
  },
  {
    group: "Partner resources",
    items: [
      ["KNMI Climate Explorer", "https://climexp.knmi.nl/", "Web tool to explore and analyse climate data."],
      ["CSA RADARSAT Constellation Mission", "https://donnees-data.asc-csa.gc.ca/en/dataset/rcm", "Radar imagery of the Earth."],
      ["CSA SWOT mission", "https://www.asc-csa.gc.ca/eng/satellites/swot/", "Surface water height of lakes, rivers and oceans."],
      ["GEO.ca", "http://geo.ca/", "Canada's open geospatial data."],
    ],
  },
];

export function SourcesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Data sources" onClose={onClose}>
      {SOURCES.map((section) => (
        <section key={section.group} className="mb-4 last:mb-0">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-dim">{section.group}</h3>
          <ul>
            {section.items.map(([name, url, note]) => (
              <li key={name} className="border-b border-hover py-1">
                <a href={url} target="_blank" rel="noreferrer" className="text-accent underline">{name}</a>
                <span className="ml-2 text-dim">{note}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Dialog>
  );
}

export function HealthDialog({ onClose }: { onClose: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth().then(setHealth, (problem) => setError(problem.message));
  }, []);

  return (
    <Dialog title="Connection check" onClose={onClose}>
      {!health && !error && <p className="text-dim">Testing each service…</p>}
      {error && <p role="alert">{error}</p>}
      {health && (
        <table className="w-full">
          <tbody>
            {Object.entries(health).map(([name, state]) => (
              <tr key={name} className="border-b border-hover">
                <th scope="row" className="py-1 text-left font-normal">{name}</th>
                <td className="py-1 font-semibold">{state.ok ? "OK" : "Not available"}</td>
                <td className="py-1 text-dim">{state.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialog>
  );
}

type NasaParam = {
  code: string; name: string; units: string; definition: string; type: string;
  availability: "monthly" | "daily" | "daily-fallback";
  keywords?: string[]; official?: boolean; nrt?: boolean; reviewing?: boolean; since?: number | null;
};
const AVAILABILITY: Record<string, string> = { monthly: "", daily: "built from daily data", "daily-fallback": "built from daily data" };
const CATEGORIES = ["All", "Meteorology", "Radiation", "Solar geometry"] as const;
let paramCache: NasaParam[] | null = null;
function unitText(units: string) {
  if (!units || units === "1" || units === "dimensionless") return "no unit";
  return units === "C" ? "°C" : units;
}
export function CustomParamDialog({ onAdd, onClose }: { onAdd: (code: string, name: string) => void; onClose: () => void }) {
  const [list, setList] = useState<NasaParam[] | null>(paramCache);
  const [problem, setProblem] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  useEffect(() => {
    if (paramCache) return;
    fetch("/api/parameters").then(async (response) => {
      if (!response.ok) throw new Error(response.status === 404 ? "This backend is an older version. Close it and start the app again with Run-Windows.bat." : ((await response.json().catch(() => null))?.detail ?? `The backend answered with error ${response.status}.`));
      paramCache = await response.json();
      setList(paramCache);
    }).catch((error) => setProblem(error instanceof TypeError ? "The backend is not answering. Start the app again with Run-Windows.bat." : String(error.message ?? error)));
  }, []);
  const q = query.trim().toLowerCase();
  const clean = query.trim().toUpperCase();
  const matches = (item: NasaParam) => !q || item.code.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
    || (item.keywords ?? []).some((word) => word.toLowerCase().includes(q));
  const filtered = (list ?? []).filter((item) => (category === "All" || item.type === category) && matches(item));
  const shown = filtered.slice(0, 120);
  const typedValid = /^[A-Z][A-Z0-9_]{1,39}$/.test(clean);
  const count = (name: (typeof CATEGORIES)[number]) => (list ?? []).filter((item) => name === "All" || item.type === name).length;
  return (
    <Dialog title="Add a NASA POWER parameter" onClose={onClose}>
      <form onSubmit={(event) => {
        event.preventDefault();
        const exact = list?.find((item) => item.code === clean);
        if (exact) onAdd(exact.code, exact.name);
        else if (shown[0]) onAdd(shown[0].code, shown[0].name);
        else if (typedValid) onAdd(clean, clean);
      }}>
        <input id="custom-code" autoFocus className="field w-full" placeholder="Search by name, keyword or code: wind, solar, humidity, T2M…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search NASA POWER parameters" />
      </form>
      {list && (
        <div className="param-cats mt-2" role="tablist" aria-label="Parameter category">
          {CATEGORIES.filter((name) => count(name) > 0).map((name) => (
            <button key={name} type="button" role="tab" aria-selected={category === name} className={category === name ? "on" : ""} onClick={() => setCategory(name)}>
              {name} <span>{count(name)}</span>
            </button>
          ))}
        </div>
      )}
      {problem && <p className="mt-3 text-up">{problem}</p>}
      {!list && !problem && <p className="mt-3 text-dim">Loading NASA's parameter list…</p>}
      {list && <p className="mt-2 text-xs text-dim">{filtered.length} of {list.length} parameters{shown.length < filtered.length ? ` · showing ${shown.length}, type to narrow` : ""} · every one is tested to work in this app</p>}
      {list && filtered.length === 0 && <p className="mt-2 text-dim">No parameter matches “{query}”. Try a simpler word such as rain, wind or sun.</p>}
      <ul className="param-list mt-2">
        {shown.map((item) => (
          <li key={item.code}><button type="button" onClick={() => onAdd(item.code, item.name)} title={item.definition}>
            <span className="flex items-baseline gap-2"><strong className="flex-1">{item.name}</strong><code>{item.code}</code></span>
            <span className="param-meta">
              <span>{unitText(item.units)}</span>
              {item.since && item.since > 1981 && <span>from {item.since}</span>}
              {AVAILABILITY[item.availability] && <span>{AVAILABILITY[item.availability]}</span>}
              {item.nrt && <span className="tag-nrt">near real time</span>}
              {item.reviewing && <span className="tag-review">NASA: under review</span>}
            </span>
          </button></li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-dim">From NASA's official <a className="text-accent underline" href="https://power.larc.nasa.gov/parameters/" target="_blank" rel="noreferrer">POWER Parameter Dictionary</a> (368 parameters). Only the ones that can make a monthly time series are listed. The rest are hidden: NASA offers them only hourly or as climatology, its monthly service fails for them, or it returns no values.</p>
    </Dialog>
  );
}
