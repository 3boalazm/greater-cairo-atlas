import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QUICK_FACT_LABELS, selectQuickFacts } from "@/lib/atlas/quick-facts";
import { getStaticAtlasDataset, getStaticEntityPageData } from "@/lib/atlas/static-dataset";
import { EntityPanel } from "@/components/atlas/EntityPanel";
import { ResearchModeProvider } from "@/components/site/ResearchMode";
import EntityPage from "@/app/entity/[code]/page";

const quickSection = (html: string) => (html.split('class="simple-entity-summary"')[1] ?? html.split("معلومات سريعة")[1] ?? "").split("</section>")[0]!;

describe("shared quick facts", () => {
  it("is imported by both views and grows coverage across the complete seed", async () => {
    for (const file of ["src/components/atlas/EntityPanel.tsx", "src/app/entity/[code]/page.tsx"]) {
      const code = await readFile(file, "utf8");
      expect(code).toContain('from "@/lib/atlas/quick-facts"');
      expect(code).toContain("selectQuickFacts(");
    }
    const data = await getStaticAtlasDataset();
    expect(data.entities).toHaveLength(564); expect(data.facts).toHaveLength(2849);
    const sources = new Map(data.evidence.map((item) => [item.code, item]));
    const old = Object.fromEntries(Object.entries(QUICK_FACT_LABELS).slice(0, 9));
    const counts = { before: 0, after: 0 }, previousCounts = { before: 0, after: 0 }, batch23Counts = { before: 0, after: 0 }, batch24Counts = { before: 0, after: 0 };
    for (const entity of data.entities) {
      const facts = data.facts.filter((fact) => fact.entity_code === entity.code).map((fact) => ({ ...fact, evidence: fact.evidence_codes.map((code) => sources.get(code)!) }));
      const previousFacts = facts.filter((fact) => !fact.evidence_codes.some((ref) => ref.startsWith("EV-V8-") || ref.startsWith("EV-E7C-") || ref.startsWith("EV-E8-")));
      const batch23Facts = facts.filter((fact) => !fact.evidence_codes.some((ref) => ref.startsWith("EV-E7C-") || ref.startsWith("EV-E8-")));
      const batch24Facts = facts.filter((fact) => !fact.evidence_codes.some((ref) => ref.startsWith("EV-E8-")));
      if (selectQuickFacts(batch24Facts, old).length) batch24Counts.before++;
      if (selectQuickFacts(batch24Facts).length) batch24Counts.after++;
      if (selectQuickFacts(batch23Facts, old).length) batch23Counts.before++;
      if (selectQuickFacts(batch23Facts).length) batch23Counts.after++;
      if (selectQuickFacts(previousFacts, old).length) previousCounts.before++;
      if (selectQuickFacts(previousFacts).length) previousCounts.after++;
      if (selectQuickFacts(facts, old).length) counts.before++;
      if (selectQuickFacts(facts).length) counts.after++;
    }
    expect(previousCounts).toEqual({ before: 54, after: 109 });
    expect(batch23Counts).toEqual({ before: 57, after: 112 });
    expect(batch24Counts).toEqual({ before: 57, after: 126 });
    expect(counts).toEqual({ before: 58, after: 130 });
  });
  it("hides long and conflicting claims, excludes retired states, ranks verified official first and counts sources", () => {
    const item = (code: string, value: string, extra = {}) => ({ code, attribute: "area", value, unit: "km2", valid_as_of: "2024-01-01", verification_state: "single_source", evidence: [{ code: `EV-${code}`, source_type: "news" }], ...extra });
    expect(selectQuickFacts([item("LONG", "ا".repeat(61))])).toEqual([]);
    expect(selectQuickFacts([item("A", "1"), item("B", "2")])).toEqual([]);
    expect(selectQuickFacts([item("A", "1"), item("B", "2", { verification_state: "rejected" })])).toHaveLength(1);
    const selected = selectQuickFacts([item("A", "1"), item("B", "1", { verification_state: "verified", evidence: [{ code: "EV-B", source_type: "official" }] })]);
    expect(selected[0]?.fact.code).toBe("B"); expect(selected[0]?.sourceCount).toBe(2);
    expect(selectQuickFacts([item("A", "ا".repeat(60))])).toHaveLength(1);
  });
  it("does not render a 61-character value in the panel quick facts", async () => {
    const entity = (await getStaticEntityPageData("CITY-15-MAY"))!;
    const long = "ط".repeat(61);
    const fact = { ...entity.facts[0]!, attribute: "area", value: long, unit: null, verification_state: "single_source" };
    const panel = renderToStaticMarkup(createElement(ResearchModeProvider, null, createElement(EntityPanel, { entity: { ...entity, facts: [fact], has_geometry: false }, loading: false, error: null, onClose: () => {}, onShowOnMap: () => {}, language: "ar", onToggleBoundary: () => {}, boundaryActive: false, boundaryLoading: false, onSelectRelated: () => {} })));
    expect(quickSection(panel)).not.toContain(long);
    expect(quickSection(panel)).toContain("لا توجد معلومات موجزة");
  });
  it("renders nonempty Arabic quick facts in the entity page and panel for real entities", async () => {
    for (const code of ["TRANSIT-HSR-L1", "LANDMARK-GIZA-ZOO", "CITY-15-MAY"]) {
      const entity = (await getStaticEntityPageData(code))!;
      const panel = renderToStaticMarkup(createElement(ResearchModeProvider, null, createElement(EntityPanel, { entity: { ...entity, has_geometry: !!entity.mapGeometry }, loading: false, error: null, onClose: () => {}, onShowOnMap: () => {}, language: "ar", onToggleBoundary: () => {}, boundaryActive: false, boundaryLoading: false, onSelectRelated: () => {} })));
      const page = renderToStaticMarkup(createElement(ResearchModeProvider, null, await EntityPage({ params: Promise.resolve({ code }), searchParams: Promise.resolve({ lang: "ar" }) })));
      for (const html of [panel, page]) {
        const section = quickSection(html);
        expect(section, code).toContain("<li");
        expect(section, code).not.toContain("لا توجد معلومات موجزة");
      }
      if (code === "CITY-15-MAY") expect(quickSection(page)).toContain(QUICK_FACT_LABELS.area!.ar);
    }
  });
});
