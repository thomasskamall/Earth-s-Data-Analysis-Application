// Who is using the app decides which measurements are offered first
// and how much statistical detail is shown. Every role can still open everything.

export type RoleId = "geologist" | "physicist" | "curious";

export type ParamInfo = {
  code: string;   // NASA POWER parameter code
  name: string;   // scientific name
  plain: string;  // everyday name
};

export const PARAMS: ParamInfo[] = [
  { code: "T2M", name: "Air temperature at 2 m", plain: "Temperature" },
  { code: "T2M_MAX", name: "Maximum air temperature at 2 m", plain: "Hottest temperature" },
  { code: "T2M_MIN", name: "Minimum air temperature at 2 m", plain: "Coldest temperature" },
  { code: "TS", name: "Earth skin temperature", plain: "Ground surface temperature" },
  { code: "RH2M", name: "Relative humidity at 2 m", plain: "Humidity" },
  { code: "QV2M", name: "Specific humidity at 2 m", plain: "Water vapour in the air" },
  { code: "T2MDEW", name: "Dew / frost point at 2 m", plain: "Dew point" },
  { code: "PRECTOTCORR", name: "Precipitation (corrected)", plain: "Rainfall" },
  { code: "PS", name: "Surface pressure", plain: "Air pressure" },
  { code: "WS10M", name: "Wind speed at 10 m", plain: "Wind speed" },
  { code: "ALLSKY_SFC_SW_DWN", name: "Surface shortwave irradiance (all sky)", plain: "Sunlight reaching the ground" },
  { code: "ALLSKY_SFC_LW_DWN", name: "Surface longwave irradiance (all sky)", plain: "Heat radiation from the sky" },
  { code: "GWETTOP", name: "Surface soil wetness", plain: "Topsoil wetness" },
  { code: "GWETROOT", name: "Root-zone soil wetness", plain: "Root-zone soil wetness" },
  { code: "GWETPROF", name: "Profile soil moisture", plain: "Deep soil wetness" },
];

export type ShowOptions = { monthly: boolean; running: boolean; trend: boolean; extremes: boolean };

export type Role = {
  id: RoleId;
  title: string;
  summary: string;
  sees: string;
  params: string[];
  detail: "plain" | "full";
  show: ShowOptions;
};

export const ROLES: Record<RoleId, Role> = {
  geologist: {
    id: "geologist",
    title: "Geologist",
    summary: "Land surface and water: rainfall, soil wetness and ground temperature.",
    sees: "Full statistics. Land and hydrology parameters first.",
    params: ["PRECTOTCORR", "GWETTOP", "GWETROOT", "GWETPROF", "TS", "T2M", "RH2M"],
    detail: "full",
    show: { monthly: true, running: true, trend: true, extremes: true },
  },
  physicist: {
    id: "physicist",
    title: "Physicist",
    summary: "The atmosphere and its energy: temperature, humidity, pressure, wind and radiation.",
    sees: "Full statistics. Atmospheric and radiation parameters first.",
    params: ["T2M", "T2M_MAX", "T2M_MIN", "TS", "RH2M", "QV2M", "T2MDEW", "PS", "WS10M", "ALLSKY_SFC_SW_DWN", "ALLSKY_SFC_LW_DWN", "PRECTOTCORR"],
    detail: "full",
    show: { monthly: true, running: true, trend: true, extremes: true },
  },
  curious: {
    id: "curious",
    title: "Curious mind",
    summary: "No background needed: temperature, humidity and rainfall where you live.",
    sees: "Plain-language results. Three everyday measurements first.",
    params: ["T2M", "RH2M", "PRECTOTCORR"],
    detail: "plain",
    show: { monthly: false, running: true, trend: true, extremes: false },
  },
};

/** Names of parameters added from the NASA list, so menus can show words instead of codes. */
export const CUSTOM_NAMES = new Map<string, string>();
export function paramLabel(code: string, plain: boolean): string {
  const info = PARAMS.find((p) => p.code === code);
  if (!info) return CUSTOM_NAMES.has(code) ? (plain ? CUSTOM_NAMES.get(code)! : `${CUSTOM_NAMES.get(code)} (${code})`) : code;
  return plain ? info.plain : `${info.name} (${code})`;
}
