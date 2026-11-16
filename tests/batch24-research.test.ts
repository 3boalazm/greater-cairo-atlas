import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EntityPanel } from "@/components/atlas/EntityPanel";
import { ResearchModeProvider } from "@/components/site/ResearchMode";
import { loadAndValidateSeedDir, parseCsvRows } from "@/lib/atlas/seed";
import { parsePartialIsoDate } from "@/lib/atlas/schema";
import { FACT_ATTRIBUTE_LABELS } from "@/lib/atlas/fact-attribute-labels";
import { formatFactValue } from "@/lib/atlas/units";
import { getStaticAtlasDataset, getStaticEntityPageData, getExportMetadata } from "@/lib/atlas/static-dataset";
import { searchEntities } from "@/lib/atlas/search";
import units from "../data/research/labels-batch22/unit_labels.json";

const read = (p: string) => readFile(p, "utf8");
const json = async (p: string) => JSON.parse(await read(p));
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const csv = (text: string) => {
  const issues: Array<{ path: string; message: string }> = [], rows = parseCsvRows(text, issues);
  expect(issues).toEqual([]); const header = rows[0]!.cells;
  return rows.slice(1).map((row) => Object.fromEntries(header.map((key, i) => [key, row.cells[i] ?? ""])));
};
type Fact = { entity_code: string; attribute_key: string; value: string; unit: string | null; status_as_of: string | null; verification_state: string; evidence_ref: string };
type Evidence = { evidence_ref: string; source_url: string; source_type: string; url_check: string };
describe("Batch 24 EAST research", () => {
  it("preserves every source file and all existing seed records", async () => {
    const hashes = await json("tests/fixtures/batch24/source-hashes.json") as Record<string, string>;
    expect(Object.keys(hashes).length).toBeGreaterThan(15);
    for (const [file, digest] of Object.entries(hashes)) expect(createHash("sha256").update(await readFile(file)).digest("hex"), file).toBe(digest);
    const before = csv(await read("tests/fixtures/batch24/baseline-entities.csv")), after = csv(await read("data/seed/entities.csv")), incoming = csv(await read("data/research/east-batch07/entities.csv"));
    expect(before).toHaveLength(535); expect(incoming).toHaveLength(21); expect(after).toHaveLength(564);
    expect(after.slice(0, 535)).toEqual(before); expect(after.slice(535, 556)).toEqual(incoming);
    expect(new Set(after.map((row) => row.code)).size).toBe(564);
    expect(await json("data/research/east-batch07/code_remap.json")).toEqual({});
    const baseline = await json("tests/fixtures/batch24/baseline-record-hashes.json") as Record<string, Record<string, string>>;
    for (const table of ["facts", "evidence"]) {
      const current = await json(`data/seed/${table}.json`) as Array<{ code: string }>;
      const records = new Map(current.map((r) => [r.code, r]));
      expect(records.size).toBe(current.length);
      for (const [code, digest] of Object.entries(baseline[table]!)) expect(hash(records.get(code)), code).toBe(digest);
    }
  });
  it("retains each fact, evidence reference, source check and verification state", async () => {
    const seed = await loadAndValidateSeedDir();
    const facts = await json("data/research/east-batch07/facts.json") as Fact[], evidence = await json("data/research/east-batch07/evidence.json") as Evidence[];
    expect(facts).toHaveLength(66); expect(evidence).toHaveLength(29);
    expect(facts.filter((f) => f.verification_state === "verified")).toHaveLength(57); expect(facts.filter((f) => f.verification_state === "single_source")).toHaveLength(9);
    for (const source of evidence) {
      const found = seed.evidence.find((e) => e.code === source.evidence_ref)!;
      expect(found.url).toBe(source.source_url); expect(found.source_type).toBe(source.source_type); expect(source.url_check).toBe("ok"); expect(found.notes).toContain("url_check=ok");
    }
    for (const raw of facts) {
      const date = raw.status_as_of ? parsePartialIsoDate(raw.status_as_of) : null;
      const matches = seed.facts.filter((f) => f.entity_code === raw.entity_code && f.attribute === raw.attribute_key && f.value === String(raw.value) && f.unit === (raw.unit || null) && f.valid_as_of === (date?.date ?? null) && f.evidence_codes.includes(raw.evidence_ref));
      expect(matches, `${raw.entity_code} ${raw.attribute_key}`).toHaveLength(1); expect(matches[0]!.verification_state).toBe(raw.verification_state);
      if (date) expect(matches[0]!.valid_as_of_precision).toBe(date.precision);
      if (raw.verification_state === "verified") expect(evidence.find((e) => e.evidence_ref === raw.evidence_ref)?.source_type).toBe("official");
    }
    const incomingCodes = new Set(facts.map((f) => f.entity_code));
    expect(seed.facts.filter((f) => incomingCodes.has(f.entity_code))).toHaveLength(66);
    const entities = new Set(seed.entities.map((e) => e.code)), refs = new Set(seed.evidence.map((e) => e.code));
    expect(seed.facts.every((f) => entities.has(f.entity_code) && f.evidence_codes.every((ref) => refs.has(ref)))).toBe(true);
    expect(seed.entities.filter((e) => e.status === "unknown").map((e) => e.code).sort()).toEqual(["DIST-GREEN-SARAYA", "LANDMARK-HELWAN-IRON-STEEL", "LANDMARK-ICONIC-TOWER", "PROJ-CENTRAL-BUSINESS-DISTRICT", "ROAD-CAIRO-ASSIUT-AGRI", "TRANSIT-MASPERO-RIVER-PIER"]);
  });
  it("registers exact bilingual labels and unit forms without modifying existing units", async () => {
    const expected = await json("tests/fixtures/batch24/labels.json") as Record<string, {ar: string; en: string}>;
    const human = await json("data/research/labels/attribute_labels_ar.json") as Record<string, string>;
    expect(Object.keys(expected)).toHaveLength(11);
    for (const [key, labels] of Object.entries(expected)) { expect(FACT_ATTRIBUTE_LABELS[key]).toEqual(labels); expect(human[key]).toBe(labels.ar); }
    const seed = await loadAndValidateSeedDir();
    for (const key of new Set(seed.facts.map((f) => f.attribute))) { expect(FACT_ATTRIBUTE_LABELS[key]?.ar, key).toBeTruthy(); expect(FACT_ATTRIBUTE_LABELS[key]?.en, key).toBeTruthy(); }
    const baseline = await json("tests/fixtures/batch24/baseline-units.json") as typeof units;
    const added = await json("tests/fixtures/batch24/units.json") as Record<string, {ar: {one: string; few: string; many: string}; en: {one: string; other: string}}>;
    expect(units._rule).toBe(baseline._rule); expect(units.units).toEqual({...baseline.units, ...added}); expect(Object.keys(added)).toHaveLength(7);
    for (const [unit, forms] of Object.entries(added)) {
      expect(formatFactValue("1", unit, "ar")).toBe(`1 ${forms.ar.one}`); expect(formatFactValue("3", unit, "ar")).toBe(`3 ${forms.ar.few}`); expect(formatFactValue("11", unit, "ar")).toBe(`11 ${forms.ar.many}`);
      expect(formatFactValue("1", unit, "en")).toBe(`1 ${forms.en.one}`); expect(formatFactValue("2", unit, "en")).toBe(`2 ${forms.en.other}`);
    }
  });
  it("serves all new entities in search, EAST and detail without geometry, with stats/export parity", async () => {
    const [data, metadata] = await Promise.all([getStaticAtlasDataset(), getExportMetadata()]);
    expect(metadata.counts).toMatchObject({entities: 564, facts: 2849, evidence: 810, fact_evidence: 3202});
    expect(data.entities).toHaveLength(metadata.counts.entities); expect(data.facts).toHaveLength(metadata.counts.facts); expect(data.evidence).toHaveLength(metadata.counts.evidence); expect(data.factEvidence).toHaveLength(metadata.counts.fact_evidence); expect(data.features).toHaveLength(3061);
    const rows = csv(await read("data/research/east-batch07/entities.csv")); const codes = new Set(rows.map((row) => row.code));
    const batch26 = new Set((await json("data/research/geometry-batch26/accepts.json")).accepts.map((a: { entity_code: string }) => a.entity_code));
    expect(data.entities.filter((e) => codes.has(e.code) && e.sector === "EAST")).toHaveLength(21);
    expect([...codes].filter((code) => batch26.has(code))).toHaveLength(18);
    for (const row of rows) {
      const entity = data.entities.find((e) => e.code === row.code)!;
      expect(searchEntities([{...entity, has_geometry: false}], entity.name_ar).map((e) => e.code)).toContain(entity.code);
      expect(data.features.some((f) => f.entity_code === entity.code)).toBe(batch26.has(row.code));
      const page = await getStaticEntityPageData(entity.code); expect(page?.code).toBe(entity.code); expect(page?.mapGeometry === null).toBe(!batch26.has(row.code)); expect(page!.facts.length).toBeGreaterThan(0);
      const panel = renderToStaticMarkup(createElement(ResearchModeProvider, null, createElement(EntityPanel, {entity: {...page!, has_geometry: false}, loading: false, error: null, onClose: () => {}, onShowOnMap: () => {}, language: "ar", onToggleBoundary: () => {}, boundaryActive: false, boundaryLoading: false, onSelectRelated: () => {}})));
      expect(panel).toContain(entity.name_ar);
    }
    const geometry = await json("data/derived/entity-map-geometries.json") as {geometries: Record<string, unknown>}; expect(Object.keys(geometry.geometries)).toHaveLength(310);
  });
});
