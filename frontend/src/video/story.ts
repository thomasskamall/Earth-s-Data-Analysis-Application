// Turns one NASA POWER analysis into a short, friendly, scientifically honest story.
import type { Analysis } from "../api/client";
import { fmt } from "../components/format";

export type SceneKind = "intro" | "concept" | "seasons" | "history" | "trend" | "future" | "surprise" | "outro";
export type Scene = {
  kind: SceneKind;
  title: string;
  icon: string;
  captions: string[]; // shown on screen, one sentence at a time
  speech: string[];   // the same sentences written for a voice
  colors: [string, string];
  start: number;
  duration: number;
};
export type Story = { scenes: Scene[]; total: number; result: Analysis; place: string; quantity: string };

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type Concept = { icon: string; text: string; season: string };
export const TEMPERATURE_SEASON = "Seasons happen because Earth's tilted axis changes how high the Sun climbs and how long days last.";
export const CONCEPTS: Record<string, Concept> = {
  T2M: { icon: "🌡️", text: "This is the air temperature two metres above the ground, about the height of your head. The Sun warms the ground first, and the ground then warms the air above it.", season: TEMPERATURE_SEASON },
  T2M_MAX: { icon: "🔥", text: "This is the highest air temperature in NASA's monthly record. It shows how hot the hottest moments get, usually on sunny afternoons.", season: TEMPERATURE_SEASON },
  T2M_MIN: { icon: "❄️", text: "This is the lowest air temperature in NASA's monthly record. The coldest moments usually come just before sunrise, after the ground has lost heat all night.", season: TEMPERATURE_SEASON },
  TS: { icon: "🪨", text: "This is the temperature of the ground's surface itself, not the air. Ground can get much hotter than air in the sunshine and colder at night.", season: TEMPERATURE_SEASON },
  RH2M: { icon: "💧", text: "Relative humidity tells how full the air is with water vapour, compared with the most it could hold at that temperature. At 100 percent the air is saturated, and dew or fog can form.", season: "Warm air can hold more water vapour, so humidity often changes when the temperature changes, even if the amount of water stays the same." },
  QV2M: { icon: "💨", text: "Specific humidity is the real amount of water vapour in the air: grams of water in every kilogram of air.", season: "Warm seasons usually carry more water vapour, because more water evaporates and warm air can hold more of it." },
  T2MDEW: { icon: "🌫️", text: "The dew point is the temperature the air would need to cool to before dew forms. A higher dew point means more water vapour in the air.", season: "Dew point rises when moist air arrives or more water evaporates, which is common in warm seasons." },
  PRECTOTCORR: { icon: "🌧️", text: "This is rain and melted snow, shown as millimetres of water per day on average. One millimetre equals one litre of water on every square metre of ground.", season: "Rainy seasons come when moist air rises, cools and turns its vapour into cloud droplets that grow heavy enough to fall." },
  PS: { icon: "🎈", text: "Air pressure is the weight of all the air above you pressing down. High places have lower pressure because there is less air above them.", season: "Pressure changes with the seasons as air warms, cools and moves between land and sea." },
  WS10M: { icon: "🌬️", text: "This is the wind speed ten metres above the ground. Wind blows because air moves from high pressure towards low pressure.", season: "Seasonal winds change when the Sun heats land and sea differently, changing pressure patterns." },
  ALLSKY_SFC_SW_DWN: { icon: "☀️", text: "This is the sunlight energy that reaches the ground after passing through clouds and air. Clouds and dust can block part of it.", season: "There is more sunlight when the Sun is higher in the sky and days are longer, unless clouds get in the way." },
  ALLSKY_SFC_LW_DWN: { icon: "♨️", text: "This is invisible heat radiation coming down from the sky. Clouds, water vapour and greenhouse gases send part of Earth's heat back down to the ground.", season: "Warmer, moister air sends more heat radiation down, so it is often higher in warm, humid seasons." },
  GWETTOP: { icon: "🌱", text: "Topsoil wetness shows how wet the top few centimetres of soil are, on a scale from 0 for completely dry to 1 for full of water.", season: "Soil gets wetter after rainy months and drier when sunshine and plants pull water back into the air." },
  GWETROOT: { icon: "🌿", text: "Root-zone wetness shows how wet the soil is where plant roots drink, on a scale from 0 for dry to 1 for full of water.", season: "The root zone reacts more slowly than the surface, because water needs time to soak down and plants use it gradually." },
  GWETPROF: { icon: "🌳", text: "Profile soil wetness describes the whole soil column, from the surface down, on a scale from 0 for dry to 1 for full of water.", season: "Deep soil changes slowly, so it remembers wet and dry seasons for longer." },
};
export const GENERIC: Concept = { icon: "🔭", text: "This is one of NASA's measurements of our planet's surface and atmosphere.", season: "Many natural quantities follow a yearly rhythm driven by the Sun and the seasons." };

const SPOKEN_UNITS: Record<string, string> = {
  "°C": "degrees Celsius", "%": "percent", "mm/day": "millimetres per day", "kPa": "kilopascals", "m/s": "metres per second",
  "g/kg": "grams per kilogram", "W/m^2": "watts per square metre", "kW-hr/m^2/day": "kilowatt hours per square metre per day", "MJ/m^2/day": "megajoules per square metre per day", "1": "", "": "",
};
function spokenUnit(unit: string) { return SPOKEN_UNITS[unit] ?? unit.replace(/\//g, " per ").replace(/\^2/g, " squared"); }
export function shownUnit(unit: string) { return unit === "1" ? "" : unit.replace("^2", "²"); }
function say(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "unknown";
  const text = fmt(Math.abs(value));
  return (value < 0 ? "minus " : "") + text;
}

type Draft = Omit<Scene, "start" | "duration">;
function scene(kind: SceneKind, title: string, icon: string, colors: [string, string], lines: [string, string][]): Draft {
  return { kind, title, icon, colors, captions: lines.map((line) => line[0]), speech: lines.map((line) => line[1]) };
}

export function buildStory(result: Analysis, place: string, quantity: string): Story {
  const u = shownUnit(result.unit);
  const su = spokenUnit(result.unit);
  const v = (value: number | null | undefined) => `${fmt(value)}${u ? " " + u : ""}`;
  const sv = (value: number | null | undefined) => `${say(value)}${su ? " " + su : ""}`;
  const concept = CONCEPTS[result.param] ?? GENERIC;
  const complete = result.annual.filter((row) => row.complete_12_months);
  const first = complete[0]?.year ?? result.annual[0]?.year;
  const last = complete[complete.length - 1]?.year ?? result.annual[result.annual.length - 1]?.year;
  const t = result.trend;
  const p = result.prediction;
  const s = result.seasonality;
  const drafts: Draft[] = [];

  drafts.push(scene("intro", "Let's explore!", "🌍", ["#6d4aff", "#1fb6ff"], [
    [`Hello, explorer! Today we visit ${place}.`, `Hello, explorer! Today we visit ${place}.`],
    [`We will discover its ${quantity.toLowerCase()} from ${first} to ${last}.`, `We will discover its ${quantity.toLowerCase()} from ${first} to ${last}.`],
    ["The data come from NASA, which combines satellites, weather observations and computer models.", "The data come from NASA, which combines satellites, weather observations and computer models."],
  ]));

  drafts.push(scene("concept", "What are we measuring?", concept.icon, ["#ff7a59", "#ffb341"], concept.text.split(/(?<=\.)\s+/).map((line) => [line, line] as [string, string])));

  if (s.peak_month && s.trough_month && s.amplitude != null) {
    drafts.push(scene("seasons", "Every year has a rhythm", "🗓️", ["#00b894", "#00cec9"], [
      [`It is highest in ${MONTHS[s.peak_month - 1]}, about ${v(s.peak_value)}.`, `It is highest in ${MONTHS[s.peak_month - 1]}, about ${sv(s.peak_value)}.`],
      [`It is lowest in ${MONTHS[s.trough_month - 1]}, about ${v(s.trough_value)}.`, `It is lowest in ${MONTHS[s.trough_month - 1]}, about ${sv(s.trough_value)}.`],
      [concept.season, concept.season],
    ]));
  }

  if (complete.length >= 2) {
    const lo = complete.reduce((a, b) => (b.value < a.value ? b : a));
    const hi = complete.reduce((a, b) => (b.value > a.value ? b : a));
    drafts.push(scene("history", `${complete.length} years in one picture`, "📊", ["#0984e3", "#6c5ce7"], [
      ["Each dot is one whole year, averaged over its twelve months.", "Each dot is one whole year, averaged over its twelve months."],
      [`The highest year was ${hi.year} (${v(hi.value)}), and the lowest was ${lo.year} (${v(lo.value)}).`, `The highest year was ${hi.year}, at ${sv(hi.value)}. The lowest was ${lo.year}, at ${sv(lo.value)}.`],
      ["Years go up and down naturally, like waves on the sea.", "Years go up and down naturally, like waves on the sea."],
    ]));
  }

  if (t) {
    const direction = t.sen_slope > 0 ? "rising" : t.sen_slope < 0 ? "falling" : "flat";
    const chance = t.mk_p < 0.001 ? "less than 1 time in 1,000" : t.mk_p < 0.01 ? "less than 1 time in 100" : `about ${Math.max(1, Math.round(t.mk_p * 100))} times in 100`;
    const spokenChance = chance.replace("1,000", "a thousand");
    drafts.push(scene("trend", t.significant ? `A real ${direction} trend` : "Is it changing?", t.significant ? (t.sen_slope > 0 ? "📈" : "📉") : "🤔", t.significant ? ["#e84393", "#fd79a8"] : ["#636e72", "#74b9ff"], t.significant ? [
      [`The line shows a ${direction} trend of ${fmt(Math.abs(t.change_per_decade))}${u ? " " + u : ""} every 10 years.`, `The line shows a ${direction} trend of ${sv(Math.abs(t.change_per_decade))} every ten years.`],
      [`If nothing were really changing, a trend this strong would appear by chance ${chance}.`, `If nothing were really changing, a trend this strong would appear by chance ${spokenChance}.`],
      ["So scientists call it statistically significant. The math alone does not tell us the cause.", "So scientists call it statistically significant. The math alone does not tell us the cause."],
    ] : [
      [`The line moves only ${fmt(Math.abs(t.change_per_decade))}${u ? " " + u : ""} every 10 years.`, `The line moves only ${sv(Math.abs(t.change_per_decade))} every ten years.`],
      ["Our test cannot tell this from natural ups and downs.", "Our test cannot tell this from natural ups and downs."],
      ["That does not prove nothing changes. It means the evidence is not strong enough yet.", "That does not prove nothing changes. It means the evidence is not strong enough yet."],
    ]));
  }

  const lastPrediction = p.available ? p.years[p.years.length - 1] : undefined;
  if (lastPrediction) {
    drafts.push(scene("future", "A peek into the future", "🔮", ["#6c5ce7", "#a29bfe"], [
      [`If the past pattern simply continues, ${lastPrediction.year} could be around ${v(lastPrediction.value)}.`, `If the past pattern simply continues, ${lastPrediction.year} could be around ${sv(lastPrediction.value)}.`],
      [`The shaded fan shows a likely range: ${fmt(lastPrediction.lower)} to ${v(lastPrediction.upper)}.`, `The shaded fan shows a likely range, from ${say(lastPrediction.lower)} to ${sv(lastPrediction.upper)}.`],
      ["This is not a promise. The real future depends on things this simple line cannot see.", "This is not a promise. The real future depends on things this simple line cannot see."],
    ]));
  }

  const top = [...result.extremes].sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0];
  drafts.push(scene("surprise", "Surprise months", "⚡", ["#fdcb6e", "#e17055"], top ? [
    [`${result.extremes.length} months were very unusual compared with the same month in other years.`, `${result.extremes.length} months were very unusual compared with the same month in other years.`],
    [`The biggest surprise: ${MONTHS[Number(top.date.slice(5, 7)) - 1]} ${top.date.slice(0, 4)}, at ${v(top.value)}.`, `The biggest surprise was ${MONTHS[Number(top.date.slice(5, 7)) - 1]} ${top.date.slice(0, 4)}, at ${sv(top.value)}.`],
    [`It was ${fmt(Math.abs(top.z))} times the usual wobble ${top.z > 0 ? "above" : "below"} normal.`, `It was ${say(Math.abs(top.z))} times the usual wobble ${top.z > 0 ? "above" : "below"} normal.`],
  ] : [
    ["No month was far outside its usual range.", "No month was far outside its usual range."],
    ["That means this place stayed within its normal monthly wobble.", "That means this place stayed within its normal monthly wobble."],
  ]));

  const takeaway = t
    ? t.significant ? `${quantity} here is ${t.sen_slope > 0 ? "rising" : "falling"}, and the change is bigger than chance would explain.` : `${quantity} here goes up and down, without a clear long-term trend.`
    : `${quantity} here follows a yearly rhythm. More years are needed to test a trend.`;
  drafts.push(scene("outro", "What did we learn?", "🎉", ["#00b894", "#6c5ce7"], [
    [takeaway, takeaway],
    ["Try another place or measurement, and keep asking questions!", "Try another place or measurement, and keep asking questions!"],
  ]));

  let clock = 0;
  const scenes = drafts.map((draft): Scene => {
    const words = draft.speech.join(" ").split(/\s+/).length;
    const duration = Math.max(6, words / 2.8 + 1.8);
    const item = { ...draft, start: clock, duration };
    clock += duration;
    return item;
  });
  return { scenes, total: clock, result, place, quantity };
}

export function sceneAt(story: Story, time: number): number {
  const index = story.scenes.findIndex((item) => time < item.start + item.duration);
  return index === -1 ? story.scenes.length - 1 : index;
}
