import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACT_ATTRIBUTE_LABELS } from "@/lib/atlas/labels";

describe("fact attribute translations", () => {
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
