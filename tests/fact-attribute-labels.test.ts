import { FACT_ATTRIBUTE_LABELS } from "@/lib/atlas/fact-attribute-labels";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { currentStatusNewsSourceCount, hasDisplayableQuickFactValue, quickFactSourceCountLabel, showOnMapLabel, statusNewsSourceCountLabel } from "@/lib/atlas/labels";

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
  it("preserves pre-existing bilingual coverage and tracks untranslated batch 19 keys", async () => {
    const facts = JSON.parse(await readFile(path.join(process.cwd(), "data/seed/facts.json"), "utf8")) as Array<{ attribute: string }>;
    const humanArabic = JSON.parse(await readFile(path.join(process.cwd(), "data/research/labels/attribute_labels_ar.json"), "utf8")) as Record<string, string>;
    const attributes = [...new Set(facts.map((fact) => fact.attribute))].sort();
    // Batch 19 is data-only: do not invent human translations or modify the UI.
    // Pin this explicit debt instead of silently weakening pre-existing coverage.
    const untranslated = JSON.parse(await readFile(path.join(process.cwd(), "tests/fixtures/batch19/untranslated-attributes.json"), "utf8")) as string[];
    const batch22Untranslated = JSON.parse(await readFile(path.join(process.cwd(), "tests/fixtures/batch22/untranslated-attributes.json"), "utf8")) as string[];
    const missingHumanArabic = attributes.filter((key) => !humanArabic[key]?.trim());
    expect(missingHumanArabic).toEqual([...untranslated, ...batch22Untranslated].sort());
    const batchFacts = JSON.parse(await readFile(path.join(process.cwd(), "data/research/central-batch05/facts.json"), "utf8")) as Array<{ attribute_key: string }>;
    const unknownFacts = JSON.parse(await readFile(path.join(process.cwd(), "data/research/unknowns-batch06/facts.json"), "utf8")) as Array<{ attribute_key: string }>;
    const batchKeys = new Set([...batchFacts, ...unknownFacts].map((fact) => fact.attribute_key));
    expect(untranslated.every((key) => batchKeys.has(key))).toBe(true);
    const missing = attributes.filter((key) => !untranslated.includes(key) && !batch22Untranslated.includes(key)).filter((key) => {
      const label = FACT_ATTRIBUTE_LABELS[key];
      return !label?.ar?.trim() || !label?.en?.trim() || label.ar === key || label.en === key || label.ar.includes("_") || !/[\u0600-\u06FF]/.test(label.ar);
    });
    expect(missing, `Missing bilingual attribute labels for: ${missing.join(", ")}`).toEqual([]);
    expect(attributes).toContain("capacity_per_day");
    expect(FACT_ATTRIBUTE_LABELS.capacity_per_day).toEqual({ ar: "السعة اليومية", en: "Daily capacity" });
  });
});
