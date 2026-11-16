import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadAndValidateSeedDir, parseCsvRows } from "@/lib/atlas/seed";
import { parsePartialIsoDate } from "@/lib/atlas/schema";
import { FACT_ATTRIBUTE_LABELS } from "@/lib/atlas/fact-attribute-labels";
import { formatFactValue } from "@/lib/atlas/units";
import { getStaticAtlasDataset, getExportMetadata } from "@/lib/atlas/static-dataset";
import { searchEntities } from "@/lib/atlas/search";

const read = (path: string) => readFile(path, "utf8");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const csvRows = (text: string) => {
  const issues: Array<{ path: string; message: string }> = [];
  const rows = parseCsvRows(text, issues);
  expect(issues).toEqual([]);
  const header = rows[0]!.cells;
  return rows.slice(1).map((row) => Object.fromEntries(header.map((key, index) => [key, row.cells[index] ?? ""])));
};
type Change = { entity_code: string; from: string; to: string; basis: string[] };
type Alias = { aliases_before: string; aliases_after: string; alias_count: number };
type Source = { evidence_ref: string; source_type: string; source_url: string; url_check: string };
type Fact = { entity_code: string; attribute_key: string; value: string; unit: string | null; status_as_of: string | null; verification_state: string; evidence_ref: string };

describe("Batch 23: second unknown-status pass and North alias repair", () => {
  it("preserves all upstream source files byte-for-byte", async () => {
    const sources = JSON.parse(await read("tests/fixtures/batch23/source-hashes.json")) as Record<string, string>;
    expect(Object.keys(sources)).toHaveLength(15);
    for (const [path, digest] of Object.entries(sources)) expect(createHash("sha256").update(await readFile(path)).digest("hex"), path).toBe(digest);
  });

  it("changes only four statuses and the 23 specified alias cells", async () => {
    const [seed, beforeText, nowText, changesText, aliasText] = await Promise.all([loadAndValidateSeedDir(), read("tests/fixtures/batch23/baseline-entities.csv"), read("data/seed/entities.csv"), read("data/research/unknowns-batch08/status_changes.json"), read("data/research/alias-fix-batch22/aliases_fix.json")]);
    const before = csvRows(beforeText), after = csvRows(nowText);
    const changes = JSON.parse(changesText) as Change[], aliases = JSON.parse(aliasText) as Record<string, Alias>;
    expect(before).toHaveLength(535); expect(after).toHaveLength(556); expect(new Set(after.map((x) => x.code)).size).toBe(556);
    expect(changes).toHaveLength(4); expect(Object.keys(aliases)).toHaveLength(23);
    expect(new Map(changes.map((c) => [c.entity_code, c.to]))).toEqual(new Map([["LINE-HELWAN-OLD-RAIL", "partial"], ["STOP-BRT-AL-HARAM", "approved_planned"], ["STOP-BRT-FAISAL", "approved_planned"], ["STOP-BRT-TERSA", "approved_planned"]]));
    for (const old of before) {
      const change = changes.find((x) => x.entity_code === old.code), fix = aliases[old.code!];
      if (change) expect(old.status).toBe(change.from);
      if (fix) expect(old.aliases).toBe(fix.aliases_before);
      expect(after.find((x) => x.code === old.code), old.code).toEqual({ ...old, status: change?.to ?? old.status, aliases: fix?.aliases_after ?? old.aliases });
    }
    expect(before.filter((r) => r.status === "unknown")).toHaveLength(8);
    expect(seed.entities.filter((r) => r.status === "unknown").map((r) => r.code).sort()).toEqual(["DIST-GREEN-SARAYA", "LANDMARK-HELWAN-IRON-STEEL", "ROAD-CAIRO-ASSIUT-AGRI", "TRANSIT-MASPERO-RIVER-PIER"]);
    expect(seed.entities.find((e) => e.code === "ROAD-CAIRO-ASSIUT-AGRI")?.status).toBe("unknown");
    let repairedCount = 0;
    for (const [code, fix] of Object.entries(aliases)) {
      const entity = seed.entities.find((e) => e.code === code)!;
      expect(entity.sector).toBe("NORTH"); expect(entity.aliases).toEqual(fix.aliases_after.split("|"));
      expect(entity.aliases).toHaveLength(fix.alias_count); expect(entity.aliases.every((alias) => !/[;؛]/.test(alias))).toBe(true);
      for (const alias of entity.aliases) expect(searchEntities([{ ...entity, has_geometry: false }], alias).some((r) => r.code === code)).toBe(true);
      repairedCount += entity.aliases.length;
    }
    expect(repairedCount).toBe(49);
    expect(before.reduce((n, row) => n + (row.aliases || "").split("|").filter(Boolean).length, 0)).toBe(850);
    expect(seed.entities.filter((row) => before.some((item) => item.code === row.code)).reduce((n, row) => n + row.aliases.length, 0)).toBe(876);
  });

  it("retains all prior fact/evidence records and appends every source claim and reference", async () => {
    const seed = await loadAndValidateSeedDir();
    const baseline = JSON.parse(await read("tests/fixtures/batch23/baseline-record-hashes.json")) as { facts: Record<string, string>; evidence: Record<string, string> };
    for (const table of ["facts", "evidence"] as const) {
      const current = new Map(seed[table].map((x) => [x.code, x]));
      for (const [code, digest] of Object.entries(baseline[table])) expect(hash(current.get(code)), `${table} ${code}`).toBe(digest);
      expect(current.size).toBe(seed[table].length);
    }
    expect(seed.facts).toHaveLength(2801); expect(seed.evidence).toHaveLength(793);
    expect(seed.facts.reduce((sum, fact) => sum + fact.evidence_codes.length, 0)).toBe(3154);
    const entities = new Set(seed.entities.map((e) => e.code)), codes = new Set(seed.evidence.map((e) => e.code));
    expect(seed.facts.every((f) => entities.has(f.entity_code) && f.evidence_codes.every((ref) => codes.has(ref)))).toBe(true);
    const rawFacts = JSON.parse(await read("data/research/unknowns-batch08/facts.json")) as Fact[];
    const sources = JSON.parse(await read("data/research/unknowns-batch08/evidence.json")) as Source[];
    expect(rawFacts).toHaveLength(50); expect(sources).toHaveLength(34);
    expect(rawFacts.filter((x) => x.verification_state === "verified")).toHaveLength(20);
    expect(rawFacts.filter((x) => x.verification_state === "single_source")).toHaveLength(30);
    const prior = seed.facts.filter((fact) => Object.hasOwn(baseline.facts, fact.code));
    expect(rawFacts.filter((f) => prior.some((x) => x.entity_code === f.entity_code && x.attribute === f.attribute_key && x.value === String(f.value)))).toHaveLength(0);
    for (const raw of sources) {
      const evidence = seed.evidence.find((x) => x.code === raw.evidence_ref)!;
      expect(evidence.url).toBe(raw.source_url || null); expect(evidence.source_type).toBe(raw.source_type); expect(evidence.notes).toContain(`url_check=${raw.url_check}`);
    }
    for (const raw of rawFacts) {
      const date = raw.status_as_of ? parsePartialIsoDate(raw.status_as_of) : null;
      const found = seed.facts.filter((f) => f.entity_code === raw.entity_code && f.attribute === raw.attribute_key && f.value === String(raw.value) && f.unit === (raw.unit || null) && f.valid_as_of === (date?.date ?? null) && f.evidence_codes.includes(raw.evidence_ref));
      expect(found, `${raw.entity_code} ${raw.attribute_key} ${raw.evidence_ref}`).toHaveLength(1);
      expect(found[0]!.verification_state).toBe(raw.verification_state);
      if (date) expect(found[0]!.valid_as_of_precision).toBe(date.precision);
      if (raw.verification_state === "verified") {
        const source = sources.find((e) => e.evidence_ref === raw.evidence_ref)!;
        expect(source.source_type).toBe("official"); expect(source.url_check).toBe("ok"); expect(source.source_url).toBeTruthy();
      }
    }
    const changes = JSON.parse(await read("data/research/unknowns-batch08/status_changes.json")) as Change[];
    for (const change of changes) expect(change.basis.some((ref) => sources.some((s) => s.evidence_ref === ref && s.source_type === "official" && s.url_check === "ok" && s.source_url))).toBe(true);
  });

  it("uses the exact supplied labels, existing unit formatting and matching export counts", async () => {
    const expected = JSON.parse(await read("tests/fixtures/batch23/attribute-labels.json")) as Record<string, { ar: string; en: string }>;
    expect(Object.keys(expected)).toHaveLength(33);
    const human = JSON.parse(await read("data/research/labels/attribute_labels_ar.json")) as Record<string, string>;
    for (const [key, value] of Object.entries(expected)) { expect(FACT_ATTRIBUTE_LABELS[key]).toEqual(value); expect(human[key]).toBe(value.ar); }
    const [dataset, metadata] = await Promise.all([getStaticAtlasDataset(), getExportMetadata()]);
    expect(dataset.entities).toHaveLength(556); expect(dataset.facts).toHaveLength(2801); expect(dataset.features).toHaveLength(3031);
    expect(metadata.counts).toMatchObject({ entities: 556, facts: 2801, evidence: 793, fact_evidence: 3154 });
    const width = dataset.facts.find((f) => f.attribute === "widening_target_width")!, length = dataset.facts.find((f) => f.attribute === "upgrade_section_length")!;
    expect(formatFactValue(width.value, width.unit, "ar")).toBe("11.5 م"); expect(formatFactValue(length.value, length.unit, "ar")).toBe("4 كم");
    expect(width.unit).toBe("m"); expect(length.unit).toBe("km");
  });
});
