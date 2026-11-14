export const TRANSIT_MODE_ORDER = [
  "metro", "metro_l4", "lrt", "monorail_east", "monorail_west", "brt", "enr", "hsr", "unclassified",
] as const;

export type TransitMode = (typeof TRANSIT_MODE_ORDER)[number];

export const TRANSIT_MODE_LABELS: Record<TransitMode, { ar: string; en: string; color: string; shape: string }> = {
  metro: { ar: "المترو (خطوط 1–3)", en: "Metro (Lines 1–3)", color: "#c8202f", shape: "circle" },
  metro_l4: { ar: "المترو — الخط الرابع (إنشاء)", en: "Metro Line 4 (construction)", color: "#7355a5", shape: "circle" },
  lrt: { ar: "القطار الكهربائي الخفيف", en: "Light Rail Transit", color: "#b74831", shape: "square" },
  monorail_east: { ar: "المونوريل الشرقي", en: "Monorail East", color: "#174d9b", shape: "diamond" },
  monorail_west: { ar: "المونوريل الغربي (إنشاء)", en: "Monorail West (construction)", color: "#527da8", shape: "hexagon" },
  brt: { ar: "الأتوبيس الترددي السريع", en: "Bus Rapid Transit", color: "#2477a8", shape: "triangle" },
  enr: { ar: "سكك حديد مصر", en: "Conventional rail (ENR)", color: "#925c2c", shape: "cross" },
  hsr: { ar: "القطار الكهربائي السريع", en: "High-Speed Rail", color: "#525e64", shape: "hexagon" },
  unclassified: { ar: "محطة نقل · الوسيلة غير محددة", en: "Transit stop · mode unconfirmed", color: "#6c7475", shape: "hexagon" },
};

export const TRANSIT_LINE_MUTED_COLORS: Record<string, string> = {
  "TRANSIT-METRO-L1": "#a86b70",
  "TRANSIT-METRO-L2": "#aa914a",
  "TRANSIT-METRO-L3": "#668b74",
  "TRANSIT-METRO-L4": "#85799b",
  "TRANSIT-LRT": "#9c766c",
  "TRANSIT-MONORAIL-EAST": "#7183a0",
  "TRANSIT-MONORAIL-WEST": "#8292a0",
  "TRANSIT-BRT": "#6f8da0",
  "TRANSIT-ENR": "#927e6b",
  "TRANSIT-HSR-L1": "#6e777b",
  "TRANSIT-HSR-L2": "#7b8589",
  "TRANSIT-HSR-L3": "#899296",
};

export const TRANSIT_LINE_COLORS: Record<string, string> = {
  "TRANSIT-METRO-L1": "#c8202f",
  "TRANSIT-METRO-L2": "#e2b527",
  "TRANSIT-METRO-L3": "#08783e",
  "TRANSIT-METRO-L4": "#7355a5",
  "TRANSIT-LRT": "#b74831",
  "TRANSIT-MONORAIL-EAST": "#174d9b",
  "TRANSIT-MONORAIL-WEST": "#527da8",
  "TRANSIT-BRT": "#2477a8",
  "TRANSIT-ENR": "#925c2c",
  "TRANSIT-HSR-L1": "#525e64",
  "TRANSIT-HSR-L2": "#65737a",
  "TRANSIT-HSR-L3": "#829098",
};

const MULTI_MODE_STATIONS: Record<string, TransitMode[]> = {
  "STOP-ADLY-MANSOUR": ["metro", "lrt"],
  "STOP-CENTRAL-CAPITAL": ["lrt", "hsr"],
  "STOP-ARTS-CULTURE-CITY": ["lrt", "monorail_east"],
  "STOP-WADI-EL-NIL": ["metro", "monorail_west"],
  "STOP-MONORAIL-MOSHIR-TANTAWY": ["monorail_east"],
};

const INTERCHANGE_STATION_CODES = new Set([
  "STOP-SADAT", "STOP-MONORAIL-MOSHIR-TANTAWY", "STOP-HADAEK-OCTOBER", "STOP-6-OCTOBER-INTERCHANGE", "RAIL-RAMSES",
]);

const METRO_MISC_STATIONS = new Set([
  "STOP-SADAT", "STOP-DEMERDASH", "STOP-ABBASSIA", "STOP-KIT-KAT", "STOP-CAIRO-STADIUM",
  "STOP-M2-SHUBRA-ELKHEIMA", "STOP-M2-KHALAFAWY", "STOP-M2-ST-TERESA",
  "STOP-M3-ROD-ELFARAG-AXIS", "STOP-M3-RING-ROAD", "STOP-M1-EL-MARG", "STOP-M1-NEW-EL-MARG",
]);

export function transitModesForEntityCode(entityCode: string): TransitMode[] {
  const explicit = MULTI_MODE_STATIONS[entityCode];
  if (explicit) return [...explicit];
  if (entityCode.startsWith("TRANSIT-METRO-L4")) return ["metro_l4"];
  if (entityCode.startsWith("TRANSIT-METRO-L") || /^STOP-M[123]-/.test(entityCode) || METRO_MISC_STATIONS.has(entityCode)) return ["metro"];
  if (entityCode.startsWith("TRANSIT-LRT") || entityCode.startsWith("STOP-LRT-")) return ["lrt"];
  if (entityCode.startsWith("TRANSIT-MONORAIL-EAST") || entityCode.startsWith("STOP-MRE-") || entityCode === "STOP-MONORAIL-MOSHIR-TANTAWY") return ["monorail_east"];
  if (entityCode.startsWith("TRANSIT-MONORAIL-WEST") || entityCode.startsWith("STOP-MRW-")) return ["monorail_west"];
  if (entityCode.startsWith("TRANSIT-BRT") || entityCode.startsWith("STOP-BRT-")) return ["brt"];
  if (entityCode.startsWith("TRANSIT-HSR") || entityCode.startsWith("STOP-HSR-")) return ["hsr"];
  if (entityCode.startsWith("TRANSIT-SUEZ-TRAIN") || entityCode.startsWith("RAIL-")) return ["enr"];
  if (entityCode === "STOP-ADLY-MANSOUR") return ["metro", "lrt"];
  if (entityCode === "STOP-ADALA-CITY") return ["monorail_east"];
  if (entityCode === "STOP-AHMED-OMAR-HASHEM") return ["hsr"];
  if (entityCode.startsWith("STOP-")) return ["unclassified"];
  return [];
}

export function isTransitInterchangeEntityCode(entityCode: string): boolean {
  return transitModesForEntityCode(entityCode).length > 1 || INTERCHANGE_STATION_CODES.has(entityCode);
}

export function transitModeForEntityCode(entityCode: string): TransitMode | null {
  return transitModesForEntityCode(entityCode)[0] ?? null;
}

export function transitModeLabel(entityCode: string, language: "ar" | "en"): string | null {
  if (entityCode.startsWith("TRANSIT-METRO-L1") || entityCode.startsWith("STOP-M1-")) return language === "ar" ? "مترو · الخط الأول" : "Metro · Line 1";
  if (entityCode.startsWith("TRANSIT-METRO-L2") || entityCode.startsWith("STOP-M2-")) return language === "ar" ? "مترو · الخط الثاني" : "Metro · Line 2";
  if (entityCode.startsWith("TRANSIT-METRO-L3") || entityCode.startsWith("STOP-M3-")) return language === "ar" ? "مترو · الخط الثالث" : "Metro · Line 3";
  if (entityCode.includes("METRO-L4")) return language === "ar" ? "مترو · الخط الرابع" : "Metro · Line 4";
  const modes = transitModesForEntityCode(entityCode);
  if (modes.length > 1) return language === "ar" ? "محطة تبادلية" : "Interchange station";
  const mode = modes[0];
  return mode ? TRANSIT_MODE_LABELS[mode][language] : null;
}
