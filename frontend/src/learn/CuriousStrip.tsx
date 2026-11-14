// Curious mind: big, friendly summary cards above the four panels.
import type { Analysis } from "../api/client";
import { fmt, signed } from "../components/format";
import { MONTHS, shownUnit } from "../video/story";
import { TerraAvatar } from "./Terra";

type Props = {
  result: Analysis | null;
  place: string;
  quantity: string;
  loading: boolean;
  error: string | null;
  onVideo: () => void;
  onTour: () => void;
  onChat: () => void;
};

export default function CuriousStrip({ result, place, quantity, loading, error, onVideo, onTour, onChat }: Props) {
  if (!result) {
    return (
      <div className="story-strip">
        <div className="strip-guide">
          <TerraAvatar size={46} mood={loading ? "think" : error ? "wow" : "talk"} />
          {loading ? <p className="strip-loading"><strong>Fetching NASA satellite data…</strong><span className="strip-dots"><i /><i /><i /></span></p>
            : error ? <p><strong>Oops, that did not load.</strong> {error} <button type="button" className="strip-link" onClick={onChat}>Ask Terra why</button></p>
            : <ol className="strip-steps">
                <li><span>1</span>Search a city above <em>or</em> click the map</li>
                <li><span>2</span>Pick what to explore</li>
                <li><span>3</span>Watch your data story 🎬</li>
              </ol>}
          {!loading && !error && <button type="button" className="strip-tour" onClick={onTour}>🧭 Show me around</button>}
        </div>
      </div>
    );
  }
  const u = shownUnit(result.unit);
  const v = (x: number | null | undefined) => `${fmt(x)}${u ? " " + u : ""}`;
  const s = result.seasonality;
  const t = result.trend;
  const p = result.prediction;
  const last = p.available ? p.years[p.years.length - 1] : undefined;
  const up = t ? t.sen_slope >= 0 : true;
  return (
    <div className="story-strip">
      <div className="story-card card-place">
        <span className="card-emoji">📍</span>
        <div><small>Exploring</small><strong>{quantity}</strong><span>{place || "your point"} · {result.coverage.replace(" to ", " → ")}</span></div>
      </div>
      {s.peak_month && s.trough_month && (
        <div className="story-card card-season">
          <span className="card-emoji">🌗</span>
          <div><small>Seasons</small><strong>Highest in {MONTHS[s.peak_month - 1]}</strong><span>{v(s.peak_value)} · lowest in {MONTHS[s.trough_month - 1]} ({v(s.trough_value)})</span></div>
        </div>
      )}
      {t && (
        <div className="story-card card-trend">
          <span className={`card-arrow ${up ? "up" : "down"}`}>{up ? "↗" : "↘"}</span>
          <div><small>Every 10 years</small><strong>{signed(t.change_per_decade)}{u ? " " + u : ""}</strong><span className={`card-badge ${t.significant ? "real" : "maybe"}`}>{t.significant ? "✅ A real change" : "🤔 Could be chance"}</span></div>
        </div>
      )}
      {last && (
        <div className="story-card card-future">
          <span className="card-emoji">🔮</span>
          <div><small>If the trend continues</small><strong>{last.year}: about {v(last.value)}</strong><span>likely between {fmt(last.lower)} and {v(last.upper)}</span></div>
        </div>
      )}
      <button type="button" className="story-cta" onClick={onVideo}>
        <span className="cta-play">▶</span>
        <span><strong>Watch the story</strong><small>narrated video</small></span>
      </button>
    </div>
  );
}
