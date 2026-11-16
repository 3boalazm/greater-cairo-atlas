import { FACT_ATTRIBUTE_LABELS } from "@/lib/atlas/fact-attribute-labels";
import { hasDisplayableQuickFactValue } from "@/lib/atlas/labels";

// Order controls display priority; retain the original nine short labels.
export const QUICK_FACT_LABELS: Record<string, { ar: string; en: string }> = {
  length: { ar: "الطول", en: "Length" }, length_approx: { ar: "الطول التقريبي", en: "Approximate length" },
  total_length: { ar: "الطول الإجمالي", en: "Total length" }, stations_count: { ar: "عدد المحطات", en: "Stations" }, total_stations: { ar: "عدد المحطات", en: "Stations" },
  stations: { ar: "المحطات", en: "Stations" }, capacity_per_day: { ar: "السعة اليومية", en: "Daily capacity" }, population: { ar: "عدد السكان", en: "Population" }, opening_date: { ar: "موعد الافتتاح", en: "Opening date" },
  ...Object.fromEntries([
    "area", "width", "lanes_per_direction", "lanes_count", "from_to", "route", "cost", "total_cost", "speed", "top_speed", "design_capacity", "hourly_capacity", "planned_daily_passengers", "daily_train_movements", "housing_units", "bed_capacity", "bridges_count", "corridor_length", "total_corridor_length", "opening", "completion_date", "establishment_year", "planned_public_reopening_year", "location", "character",
  ].map((key) => [key, FACT_ATTRIBUTE_LABELS[key]!])),
};

interface QuickFact {
  code: string; attribute: string; value: string; unit: string | null; valid_as_of: string | null;
  verification_state: string; evidence: Array<{ code: string; source_type: string }>;
}

export function selectQuickFacts<T extends QuickFact>(facts: readonly T[], labels = QUICK_FACT_LABELS): Array<{ fact: T; sourceCount: number; attribute: string }> {
  const active = facts.filter((fact) => !["rejected", "superseded"].includes(fact.verification_state));
  const groups = new Map<string, T[]>();
  for (const fact of active) {
    if (Object.hasOwn(labels, fact.attribute)) groups.set(fact.attribute, [...(groups.get(fact.attribute) ?? []), fact]);
  }
  return [...groups.entries()].flatMap(([attribute, claims]) => {
    // Apply conflict detection to all claims, even those too long to show as quick facts.
    const numerical = claims.filter((fact) => /[0-9٠-٩۰-۹]/u.test(fact.value));
    if (new Set(numerical.map((fact) => JSON.stringify([fact.value, fact.unit]))).size > 1) return [];
    const eligible = claims.filter((fact) => hasDisplayableQuickFactValue(fact.value) && fact.value.length <= 60);
    if (!eligible.length) return [];
    const ordered = [...eligible].sort((a, b) => {
      const official = (fact: T) => fact.verification_state === "verified" && fact.evidence.some((source) => source.source_type === "official") ? 1 : 0;
      return official(b) - official(a) || String(b.valid_as_of ?? "").localeCompare(String(a.valid_as_of ?? "")) || a.code.localeCompare(b.code);
    });
    return [{ fact: ordered[0]!, sourceCount: new Set(eligible.flatMap((fact) => fact.evidence.map((source) => source.code))).size, attribute }];
  }).sort((a, b) => Object.keys(labels).indexOf(a.attribute) - Object.keys(labels).indexOf(b.attribute)).slice(0, 3);
}
