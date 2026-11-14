export type ScienceInfo = {
  definition: string; mechanisms: string; caveat: string;
  equations: { title: string; latex: string; note: string }[];
  references: { title: string; url: string }[];
};
const REFS = {
  meteorology: { title: "NASA POWER meteorology", url: "https://power.larc.nasa.gov/docs/methodology/meteorology/" },
  humidity: { title: "NASA humidity methodology", url: "https://power.larc.nasa.gov/docs/methodology/meteorology/relative-humidity/" },
  parameters: { title: "POWER parameter definitions", url: "https://power.larc.nasa.gov/docs/tutorials/parameters/" },
  energy: { title: "NASA energy budget", url: "https://science.nasa.gov/earth/earth-observatory/climate-and-earths-energy-budget/" },
  water: { title: "NASA water cycle", url: "https://gpm.nasa.gov/education/articles/nasa-earth-science-water-cycle" },
};
const refs = (...names: (keyof typeof REFS)[]) => names.map((name) => REFS[name]);
const ENERGY = {
  title: "Surface energy balance",
  latex: String.raw`R_n=H+L_v E+G+\frac{\partial U_s}{\partial t}`,
  note: "Rₙ is net radiation; H sensible heat; LᵥE latent heat; G ground heat, all W m⁻². Stored energy Uₛ is J m⁻² and enters as a time derivative. Positive right-hand terms remove available surface energy.",
};
const EMISSION = {
  title: "Stefan–Boltzmann thermal emission",
  latex: String.raw`F=\varepsilon\sigma T^4`,
  note: "F is emitted flux in W m⁻², ε emissivity, σ the Stefan–Boltzmann constant and T absolute temperature in kelvin. This physical law is explanatory, not a fitted temperature-trend equation.",
};
const RH = {
  title: "Relative humidity and saturation",
  latex: String.raw`RH=100\frac{e}{e_s(T)},\qquad \frac{d\ln e_s}{dT}\simeq\frac{L_v}{R_v T^2}`,
  note: "e is vapour pressure, eₛ saturation vapour pressure; POWER RH uses liquid-water saturation. The Clausius–Clapeyron approximation uses kelvin, locally constant latent heat Lᵥ and the water-vapour gas constant Rᵥ.",
};
const QV = {
  title: "Specific humidity to vapour pressure",
  latex: String.raw`w=\frac{q}{1-q},\qquad e=\frac{q p}{\varepsilon+(1-\varepsilon)q},\qquad\varepsilon\simeq0.622`,
  note: "q is vapour/moist-air mass fraction in kg kg⁻¹; w vapour/dry-air mass ratio; p and e share pressure units. Divide QV2M in g kg⁻¹ by 1000 before substitution. ε is the dry-air/vapour gas-constant ratio.",
};
const WATER = {
  title: "Simplified water balance",
  latex: String.raw`\frac{dS}{dt}=P-ET-Q`,
  note: "S is water-equivalent storage depth; P precipitation, ET evapotranspiration and Q net runoff/drainage loss are depth/time. Imported water is omitted. Rainfall alone does not provide every budget term.",
};
export function getScience(param: string): ScienceInfo {
  const code = param.trim().toUpperCase();
  if (["T2M", "T2M_MAX", "T2M_MIN", "TS"].includes(code)) return {
    definition: code === "TS" ? "Earth skin temperature describes the modeled surface’s thermal state, not the air temperature at 2 m." : `${code === "T2M" ? "Air temperature" : code === "T2M_MAX" ? "Maximum-temperature parameter" : "Minimum-temperature parameter"} at 2 m, summarized in monthly NASA POWER records. The app’s Max/Min ribbon is the range of these monthly records, not a reconstructed daily temperature range.`,
    mechanisms: "Solar and infrared exchange, turbulent sensible and latent heat, conduction, advection and storage shape temperature. The seasonal range reflects recurring variability; the annual trend describes a separate longer-term tendency.",
    caveat: "MERRA-2 combines observations with a model and averages over a grid cell. Local elevation, urban surfaces and microclimate may differ substantially; a temperature trend alone does not identify greenhouse forcing, urbanization or another cause.",
    equations: [ENERGY, EMISSION], references: refs("meteorology", "parameters", "energy"),
  };
  if (["RH2M", "QV2M", "T2MDEW"].includes(code)) return {
    definition: code === "RH2M" ? "Relative humidity is vapour pressure as a percentage of saturation vapour pressure at the same temperature; it is not the amount of water stored in the air." : code === "QV2M" ? "Specific humidity is water-vapour mass divided by total moist-air mass. Check the returned units: g kg⁻¹ and kg kg⁻¹ differ by a factor of 1000." : "Dew/frost point is the saturation temperature associated with a parcel’s vapour pressure. It describes moisture, not an independent temperature forcing.",
    mechanisms: "Evaporation, condensation, mixing and transport change moisture. Saturation vapour pressure rises with temperature, so relative humidity can fall without a decrease in specific humidity; use related variables to distinguish these possibilities.",
    caveat: "Humidity comparisons depend on temperature and the saturation convention. POWER RH uses saturation over liquid water. A single monthly series cannot demonstrate local drying, condensation or a particular transport pathway.",
    equations: [RH, QV], references: refs("humidity", "meteorology", "parameters"),
  };
  if (code === "PRECTOTCORR") return {
    definition: "Corrected precipitation includes rain and solid forms. In this monthly product, mm/day denotes a monthly mean daily water-depth rate, not a monthly accumulated total.",
    mechanisms: "Moisture convergence, uplift, condensation, cloud microphysics and evaporation govern precipitation. Seasonal and interannual variability can differ from the long-term trend; rainfall does not determine available soil water by itself.",
    caveat: "Reanalysis precipitation is not a local gauge record. Monthly means hide short intense storms, so these data do not estimate flood risk or rainfall return periods. Precipitation-to-storage changes also require runoff and evapotranspiration.",
    equations: [WATER, { title: "Mean daily rate to monthly water depth", latex: String.raw`P_{\mathrm{month}}=\bar p_{\mathrm{day}}\,d_{\mathrm{month}}`, note: "Multiply the monthly mean daily rate (mm/day) by the number of days in that month to obtain mm/month. The displayed chart retains the original rate; this conversion is explanatory." }],
    references: refs("meteorology", "parameters", "water"),
  };
  if (["GWETTOP", "GWETROOT", "GWETPROF"].includes(code)) return {
    definition: "This NASA soil-wetness parameter represents a model-defined layer index, not a measured mass of water. Topsoil, root-zone and profile indices refer to different parts of the modeled soil.",
    mechanisms: "Precipitation and infiltration replenish modeled soil moisture; evapotranspiration, redistribution and drainage remove or move it. Storage can lag rainfall, but identifying that lag requires joint time-series analysis.",
    caveat: "An index is not water depth or gravimetric moisture. Its layer and normalization come from parameter metadata; do not convert it to groundwater mass. A wetness trend alone does not establish drought impacts or irrigation effects.",
    equations: [{ title: "Conceptual layer-water balance", latex: String.raw`\frac{dS_z}{dt}=I_z-ET_z-D_z`, note: "S_z is layer storage depth; I_z net inflow, ET_z evapotranspiration loss and D_z net drainage are depth/time. The displayed wetness index alone does not provide storage depth or close this balance." }],
    references: refs("meteorology", "parameters", "water"),
  };
  if (["PS", "WS10M"].includes(code)) return {
    definition: code === "PS" ? "Surface pressure reflects the weight of the air column over the modeled surface. It is not sea-level pressure; elevation matters." : "Wind speed at 10 m is the magnitude of the modeled horizontal wind vector. It supplies neither direction nor a spatial pressure gradient.",
    mechanisms: "Air-column mass and temperature influence pressure. Horizontal pressure gradients accelerate flow, while Earth’s rotation, friction and terrain redirect or slow it; a scalar speed record cannot separate these processes.",
    caveat: "Grid-average elevation and boundary-layer modeling affect these values. Monthly wind averages are not gust speeds or the complete flow field; pressure trends do not by themselves identify circulation changes.",
    equations: [
      { title: "Hydrostatic balance", latex: String.raw`\frac{\partial p}{\partial z}=-\rho g,\qquad p=\rho R_dT_v`, note: "p is pressure, z height, ρ air density, g gravity, R_d the dry-air gas constant and T_v virtual temperature in kelvin. Hydrostatic balance neglects vertical acceleration; T_v accounts for moist-air density." },
      { title: "Simplified horizontal momentum balance", latex: String.raw`\frac{D\mathbf v}{Dt}=-\frac{1}{\rho}\nabla_h p-f\mathbf k\times\mathbf v+\mathbf F_{\mathrm{friction}}`, note: "v is horizontal velocity; f the Coriolis parameter and k the vertical unit vector. Every right-hand term is acceleration; this idealization omits unresolved turbulence and other terms." },
    ], references: refs("meteorology", "parameters"),
  };
  if (["ALLSKY_SFC_SW_DWN", "ALLSKY_SFC_LW_DWN"].includes(code)) return {
    definition: code.includes("_SW_") ? "Downward all-sky shortwave irradiance is solar radiation reaching the surface after cloud and atmospheric effects. It is not the net radiation budget." : "Downward all-sky longwave irradiance is infrared radiation emitted toward the surface by the atmosphere and clouds, not emission inferred from the local 2 m temperature alone.",
    mechanisms: code.includes("_SW_") ? "Solar geometry, clouds, aerosols and atmospheric absorption shape the incoming solar signal. Surface albedo controls how much is absorbed; temperature response also depends on other energy transfers." : "Atmospheric temperature, water vapour, clouds and greenhouse gases affect infrared emission and absorption. Upward surface radiation and turbulent heat fluxes are also needed to explain surface-energy changes.",
    caveat: "Radiation products have source-specific grids and periods. Use returned units: convert kWh m⁻² day⁻¹ to average W m⁻² with a factor 1000/24 before applying flux laws. One radiation series cannot attribute a trend to a particular constituent.",
    equations: [code.includes("_SW_") ? { title: "Absorbed shortwave", latex: String.raw`F_{\mathrm{abs}}=(1-a)F_{\downarrow}`, note: "a is surface albedo, between 0 and 1. F_abs and F_down share flux units; absorbed shortwave alone is not total net radiation." } : EMISSION, ENERGY],
    references: refs("parameters", "energy"),
  };
  return {
    definition: `No curated physical interpretation is available for ${param}. Read its NASA metadata before assigning meaning or units.`,
    mechanisms: "The numerical summaries describe this record only. No variable-specific mechanisms or laws are inferred from an unknown parameter code.",
    caveat: "Availability, aggregation, units and bounds can differ for custom parameters; the app deliberately does not invent a physical interpretation.",
    equations: [], references: refs("parameters"),
  };
}
