// Quiz questions built from the loaded data, each with a short explanation.
import type { Analysis } from "../api/client";
import { fmt, pText, signed } from "../components/format";
import { MONTHS, shownUnit } from "../video/story";

export type Question = { q: string; options: string[]; answer: number; explain: string };

function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
}

/** Shuffle options while remembering where the correct one went. */
function mix(rand: () => number, correct: string, wrong: string[]): Pick<Question, "options" | "answer"> {
  const options = [correct, ...wrong.filter((w, i, all) => w !== correct && all.indexOf(w) === i)];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { options, answer: options.indexOf(correct) };
}

export function buildQuiz(result: Analysis, place: string, quantity: string, alpha: number): Question[] {
  const rand = seeded(`${result.param}${result.lat}${result.lon}${result.coverage}`);
  const u = shownUnit(result.unit);
  const v = (x: number | null | undefined) => `${fmt(x)}${u ? " " + u : ""}`;
  const name = quantity.toLowerCase();
  const out: Question[] = [];
  const s = result.seasonality;
  const t = result.trend;
  const p = result.prediction;

  if (s.peak_month && s.trough_month) {
    const others = MONTHS.filter((_, i) => i !== s.peak_month! - 1 && i !== s.trough_month! - 1).sort(() => rand() - 0.5);
    out.push({
      q: `On average, in which month is ${name} highest in ${place}?`,
      ...mix(rand, MONTHS[s.peak_month - 1], [MONTHS[s.trough_month - 1], others[0], others[1]]),
      explain: `${MONTHS[s.peak_month - 1]} has the highest average (${v(s.peak_value)}) and ${MONTHS[s.trough_month - 1]} the lowest (${v(s.trough_value)}). That yearly rhythm is the seasonal cycle.`,
    });
  }
  if (t) {
    const correct = !t.significant ? "No clear trend: it could be chance" : t.sen_slope > 0 ? "Going up" : "Going down";
    out.push({
      q: `Looking at the long-term trend (${t.first_year}–${t.last_year}), ${name} in ${place} is…`,
      ...mix(rand, correct, ["Going up", "Going down", "No clear trend: it could be chance"]),
      explain: `The trend is ${signed(t.change_per_decade)}${u ? " " + u : ""} per decade with p ${pText(t.mk_p)}. ${t.significant ? `Because p is below α = ${t.alpha}, the trend is statistically significant.` : `Because p is not below α = ${t.alpha}, we cannot rule out chance.`}`,
    });
    out.push({
      q: `The trend test gives p ${pText(t.mk_p)}. With α = ${alpha}, what can we say?`,
      ...mix(rand, t.mk_p < alpha ? "The trend is statistically significant" : "The trend is not statistically significant", ["The trend is statistically significant", "The trend is not statistically significant", "The cause of the trend is proven", "The data must be wrong"]),
      explain: "We compare p with α. If p < α the pattern is unlikely to be luck alone. Either way, the test says nothing about the cause.",
    });
    const real = t.change_per_decade;
    const unitText = u ? ` ${u}` : "";
    const fake = [real * -1, real * 3 + (real === 0 ? 1 : 0), real / 4].map((x) => `${signed(x)}${unitText}`);
    out.push({
      q: `About how much does ${name} change every 10 years here (Sen's slope)?`,
      ...mix(rand, `${signed(real)}${unitText}`, fake),
      explain: `Sen's slope is ${signed(t.sen_slope)}${unitText} per year, so ${signed(real)}${unitText} per decade. It is the median of the slopes between all pairs of years.`,
    });
  }
  out.push({
    q: "What does the shaded band (Max–Min ribbon) on the time-series chart show?",
    ...mix(rand, "Each year's lowest and highest monthly value", ["Each year's lowest and highest monthly value", "The measurement error", "A forecast of the future", "Daily record values"]),
    explain: "For every year, the ribbon spans from the lowest month to the highest month. It shows the yearly range, not uncertainty.",
  });
  const last = p.available ? p.years[p.years.length - 1] : undefined;
  if (last) out.push({
    q: `For ${last.year} the app shows about ${v(last.value)} with a ${Math.round(p.confidence_level * 100)}% prediction interval of ${fmt(last.lower)} to ${v(last.upper)}. What does that mean?`,
    ...mix(rand, "If the past straight-line pattern continues, that year will probably fall in this range", ["If the past straight-line pattern continues, that year will probably fall in this range", `The value will be exactly ${v(last.value)}`, "Climate models guarantee this range", "It is the range of all past years"]),
    explain: "A prediction interval assumes the historical linear pattern continues. It is a statistical extrapolation, not a climate-model forecast.",
  });
  out.push({
    q: `A NASA POWER value for ${place} describes…`,
    ...mix(rand, "An area tens of kilometres wide, estimated from satellites and a model", ["An area tens of kilometres wide, estimated from satellites and a model", "One thermometer in the city centre", "The average of the whole country", "A single satellite photo"]),
    explain: "NASA POWER uses the MERRA-2 reanalysis and satellite products on a grid. Each value represents a grid cell, not one station.",
  });
  out.push({
    q: "Does a statistically significant trend tell us what caused it?",
    ...mix(rand, "No: finding the cause needs physics and more evidence", ["No: finding the cause needs physics and more evidence", "Yes, always", "Only if p is exactly 0", "Only for temperature"]),
    explain: "Statistics can show that something changed. Explaining why needs physical understanding and other data, such as related variables.",
  });
  if (/^(T2M|TS)/.test(result.param)) out.push({
    q: "Why do we have seasons?",
    ...mix(rand, "Earth's tilted axis changes how high the Sun climbs and how long days last", ["Earth's tilted axis changes how high the Sun climbs and how long days last", "Earth is much closer to the Sun in summer", "The Moon blocks sunlight in winter", "Clouds only form in winter"]),
    explain: "Earth's axis is tilted about 23.4°. Earth is actually closest to the Sun in early January, during the northern winter.",
  });
  if (/^PREC/.test(result.param)) out.push({
    q: "1 mm of rain falling on 1 m² of ground equals…",
    ...mix(rand, "1 litre of water", ["1 litre of water", "1 millilitre of water", "10 litres of water", "1 cubic metre of water"]),
    explain: "1 m² × 0.001 m = 0.001 m³, which is exactly 1 litre.",
  });
  return out;
}
