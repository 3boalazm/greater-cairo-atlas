import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { currentStatusNewsSourceCount, FACT_ATTRIBUTE_LABELS, hasDisplayableQuickFactValue, quickFactSourceCountLabel, showOnMapLabel, statusNewsSourceCountLabel } from "@/lib/atlas/labels";

describe("fact attribute translations", () => {
  it("uses correct Arabic plural forms for quick-fact source counts and hides a single source", () => {
    expect(quickFactSourceCountLabel(1, "ar")).toBeNull();
    expect(quickFactSourceCountLabel(2, "ar")).toBe("مصدران");
    expect(quickFactSourceCountLabel(3, "ar")).toBe("3 مصادر");
    expect(quickFactSourceCountLabel(10, "ar")).toBe("10 مصادر");
    expect(quickFactSourceCountLabel(11, "ar")).toBe("11 مصدرًا");
    expect(quickFactSourceCountLabel(3, "en")).toBe("3 sources");
  });
  it("filters empty quick-fact values and supplies explicit map-button labels in both locales", () => {
    expect(["", "  ", null, undefined].filter(hasDisplayableQuickFactValue)).toEqual([]);
    expect(["0", 0, 12.5].filter(hasDisplayableQuickFactValue)).toEqual(["0", 0, 12.5]);
    expect(showOnMapLabel("ar")).toBe("اعرض على الخريطة");
    expect(showOnMapLabel("en")).toBe("Show on map");
  });
  it("counts news sources on the latest claim matching the entity's current status", () => {
    const facts = [
      { attribute: "operational_status", value: "operational", valid_as_of: "2025-09-01", verification_state: "candidate", evidence: [{ code: "EV-OLD", source_type: "news" }] },
      { attribute: "operational_status", value: "operational", valid_as_of: "2026-05-23", verification_state: "corroborated", evidence: [{ code: "EV-R9-001", source_type: "news" }] },
      { attribute: "operational_status", value: "operational", valid_as_of: "2026-05-23", verification_state: "corroborated", evidence: [{ code: "EV-R9-002", source_type: "news" }] },
      { attribute: "operational_status", value: "unknown", valid_as_of: "2026-11-13", verification_state: "candidate", evidence: [{ code: "EV-000", source_type: "secondary" }] },
    ];
    expect(currentStatusNewsSourceCount(facts, "operational")).toBe(2);
    expect(statusNewsSourceCountLabel(2, "ar")).toBe("مصدران إخباريان");
    expect(statusNewsSourceCountLabel(2, "en")).toBe("2 news sources");
    expect(statusNewsSourceCountLabel(1, "ar")).toBeNull();
  });
  it("has readable Arabic and English labels for every key in the canonical fact data", async () => {
    const facts = JSON.parse(await readFile(path.join(process.cwd(), "data/seed/facts.json"), "utf8")) as Array<{ attribute: string }>;
    const humanArabic = JSON.parse(await readFile(path.join(process.cwd(), "data/research/labels/attribute_labels_ar.json"), "utf8")) as Record<string, string>;
    const attributes = [...new Set(facts.map((fact) => fact.attribute))].sort();
    const missingHumanArabic = attributes.filter((key) => !humanArabic[key]?.trim());
    expect(missingHumanArabic, `Missing human-written Arabic labels for: ${missingHumanArabic.join(", ")}`).toEqual([]);
    const missing = attributes.filter((key) => {
      const label = FACT_ATTRIBUTE_LABELS[key];
      return !label?.ar?.trim() || !label?.en?.trim() || label.ar === key || label.en === key || label.ar.includes("_") || !/[\u0600-\u06FF]/.test(label.ar);
    });
    expect(missing, `Missing bilingual attribute labels for: ${missing.join(", ")}`).toEqual([]);
    expect(attributes).toContain("capacity_per_day");
    expect(FACT_ATTRIBUTE_LABELS.capacity_per_day).toEqual({ ar: "السعة اليومية", en: "Daily capacity" });
  });
});
