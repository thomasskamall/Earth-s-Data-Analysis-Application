// "Did you know?" cards: well-established science facts plus highlights from the loaded data.
import type { Analysis } from "../api/client";
import { fmt, signed } from "../components/format";
import { MONTHS, shownUnit } from "../video/story";

export type Fact = { icon: string; text: string; fromData?: boolean };

const FAMILY_FACTS: Record<string, Fact[]> = {
  temperature: [
    { icon: "🌍", text: "Earth's global surface temperature in 2011–2020 was about 1.1 °C warmer than in 1850–1900 (IPCC, 2021)." },
    { icon: "🏝️", text: "Land has warmed faster than the ocean: about 1.6 °C over land versus 0.9 °C over the ocean for 2011–2020 compared with 1850–1900 (IPCC)." },
    { icon: "🌗", text: "Seasons are caused by Earth's 23.4° axial tilt, not by its distance from the Sun. Earth is actually closest to the Sun in early January." },
  ],
  humidity: [
    { icon: "♨️", text: "Warmer air can hold about 7% more water vapour for every 1 °C of warming (the Clausius–Clapeyron relation)." },
    { icon: "💧", text: "Relative humidity can fall on a hot afternoon even if the amount of water in the air stays the same, because warm air could hold more." },
    { icon: "☁️", text: "Water vapour is Earth's most abundant greenhouse gas, and it amplifies warming caused by other gases." },
  ],
  rain: [
    { icon: "🪣", text: "1 mm of rain on 1 m² of ground is exactly 1 litre of water." },
    { icon: "🌎", text: "Averaged over the whole planet, about 1 metre of precipitation falls every year." },
    { icon: "⛰️", text: "Mountains squeeze rain out of moist air as it rises and cools, which is why their windward sides are often much wetter." },
  ],
  soil: [
    { icon: "🌱", text: "NASA's soil wetness runs from 0 (completely dry soil) to 1 (soil whose pores are full of water)." },
    { icon: "🌳", text: "Deep soil reacts slowly, so it can remember a wet or dry season for months." },
    { icon: "🌾", text: "Soil moisture controls how much sunshine is used to evaporate water instead of heating the air." },
  ],
  radiation: [
    { icon: "☀️", text: "Sunlight at the top of the atmosphere carries about 1361 W/m², the “solar constant”." },
    { icon: "🌐", text: "Spread over the whole globe and over day and night, that is about 340 W/m² on average." },
    { icon: "☁️", text: "Clouds reflect sunlight back to space, so cloudy months bring less shortwave energy to the ground." },
  ],
  wind: [
    { icon: "🌬️", text: "Wind blows from high to low pressure, and Earth's rotation turns it sideways (the Coriolis effect)." },
    { icon: "🏙️", text: "Wind is usually slower near the ground because trees, buildings and hills create friction." },
  ],
  pressure: [
    { icon: "🎈", text: "Average sea-level air pressure is about 101.3 kPa: the weight of all the air above you." },
    { icon: "🏔️", text: "Near the surface, pressure drops by roughly 11–12% for every kilometre you climb." },
  ],
  general: [
    { icon: "🛰️", text: "NASA POWER blends satellite observations and the MERRA-2 model, so it has data even where there are no weather stations." },
    { icon: "🔲", text: "Each value describes a grid cell tens of kilometres wide, not a single street or field." },
  ],
};

function family(param: string) {
  if (/^(T2M|TS|T10M|TSURF|TSOIL|FROST)/.test(param)) return "temperature";
  if (/^(RH|QV|T2MDEW|T2MWET|TQV|PW)/.test(param)) return "humidity";
  if (/^(PREC|IMERG|EVP|SNO)/.test(param)) return "rain";
  if (/^(GWET|SFMC|RZMC|EVLAND)/.test(param)) return "soil";
  if (/SW_|LW_|KT|PAR|UV|INSOL|TOA/.test(param)) return "radiation";
  if (/^(WS|WD|U10|V10|U2|V2|U50|V50)/.test(param)) return "wind";
  if (/^(PS|SLP)/.test(param)) return "pressure";
  return "general";
}

export function buildFacts(result: Analysis | null, place: string, quantity: string): Fact[] {
  const list: Fact[] = [];
  if (result) {
    const u = shownUnit(result.unit);
    const v = (x: number | null | undefined) => `${fmt(x)}${u ? " " + u : ""}`;
    const s = result.seasonality;
    const t = result.trend;
    if (s.peak_month && s.trough_month) list.push({ icon: "📅", fromData: true, text: `In ${place}, ${quantity.toLowerCase()} is highest on average in ${MONTHS[s.peak_month - 1]} (${v(s.peak_value)}) and lowest in ${MONTHS[s.trough_month - 1]} (${v(s.trough_value)}): a seasonal swing of ${v(s.amplitude)}.` });
    if (t) list.push({ icon: t.sen_slope >= 0 ? "⬆️" : "⬇️", fromData: true, text: `From ${t.first_year} to ${t.last_year} the trend is ${signed(t.change_per_decade)}${u ? " " + u : ""} per decade, about ${signed(t.total_change)}${u ? " " + u : ""} in total. ${t.significant ? "The test says this is unlikely to be chance alone." : "The test cannot rule out chance, so we call it “not significant”."}` });
    const values = result.monthly.filter((row) => row.value !== null);
    if (values.length) {
      const high = values.reduce((a, b) => (b.value! > a.value! ? b : a));
      const low = values.reduce((a, b) => (b.value! < a.value! ? b : a));
      list.push({ icon: "🏆", fromData: true, text: `The highest single month in this record was ${high.date} (${v(high.value)}); the lowest was ${low.date} (${v(low.value)}).` });
    }
    if (result.extremes.length) list.push({ icon: "⚡", fromData: true, text: `${result.extremes.length} months were unusual: more than 2 standard deviations away from what is normal for that calendar month.` });
  }
  return [...list, ...FAMILY_FACTS[family(result?.param ?? "")], ...(family(result?.param ?? "") === "general" ? [] : FAMILY_FACTS.general)];
}
