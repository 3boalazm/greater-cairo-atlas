import { describe, expect, it } from "vitest";
import { formatFactValue } from "@/lib/atlas/units";
import UNIT_DATA from "../data/research/labels-batch22/unit_labels.json";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";

describe("fact units, for display only", () => {
  it("maps every non-provenance seed unit or leaves an already-readable Arabic unit as stored", async () => {
    const data = await getStaticAtlasDataset();
    const forms = UNIT_DATA.units as Record<string, { hide?: boolean; ar?: { one: string; few: string; many: string }; en?: { one: string; other: string } }>;
    const exempt = new Set(["عمارة", "مصنع", "أسرة", "حي"]);
    const provenance = (unit: string) => unit === "OSM node ID" || /^stop position in OSM relation \d+$/.test(unit) || /^OSM route=train relation \d+$/.test(unit);
    for (const unit of new Set(data.facts.flatMap((fact) => fact.unit ? [fact.unit] : []))) {
      if (provenance(unit) || exempt.has(unit)) { expect(formatFactValue("1", unit, "ar")).toBe(`1 ${unit}`); continue; }
      const form = forms[unit];
      expect(form, unit).toBeDefined();
      if (form!.hide) { expect(formatFactValue("1", unit, "ar")).toBe("1"); continue; }
      expect(Object.values(form!.ar!).every(Boolean), unit).toBe(true);
      expect(Object.values(form!.en!).every(Boolean), unit).toBe(true);
      for (const [value, choice] of [["1", "one"], ["2", "few"], ["5", "few"], ["10", "few"], ["21", "many"], ["1.0", "many"], ["1-2", "many"], ["text", "many"]] as const) expect(formatFactValue(value, unit, "ar")).toBe(`${value} ${form!.ar![choice]}`);
      expect(formatFactValue("1", unit, "en")).toBe(`1 ${form!.en!.one}`);
      expect(formatFactValue("1.0", unit, "en")).toBe(`1.0 ${form!.en!.other}`);
    }
  });
  it("uses the supplied plural rules and hides date-like units without altering values", () => {
    expect(formatFactValue("1", "station", "ar")).toBe("1 محطة");
    expect(formatFactValue("5", "stations", "ar")).toBe("5 محطات");
    expect(formatFactValue("٥", "stations", "ar")).toBe("٥ محطات");
    expect(formatFactValue("21", "stations", "ar")).toBe("21 محطة");
    expect(formatFactValue("1.76", "million_passengers", "ar")).toBe("1.76 مليون راكب");
    expect(formatFactValue("1891", "year", "ar")).toBe("1891");
    expect(formatFactValue("2024-10-12", "date", "en")).toBe("2024-10-12");
    expect(formatFactValue("123", "unknown_unit", "ar")).toBe("123 unknown_unit");
    expect(formatFactValue("123", "OSM node ID", "en")).toBe("123 OSM node ID");
    expect(formatFactValue("4", "stop position in OSM relation 12", "ar")).toBe("4 stop position in OSM relation 12");
    expect(formatFactValue("4", "OSM route=train relation 12", "en")).toBe("4 OSM route=train relation 12");
  });
});
