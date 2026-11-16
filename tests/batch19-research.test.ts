import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadAndValidateSeedDir, parseCsvRows } from "@/lib/atlas/seed";
import { getStaticAtlasDataset, getStaticEntityPageData } from "@/lib/atlas/static-dataset";
import { searchEntities } from "@/lib/atlas/search";
import { parsePartialIsoDate } from "@/lib/atlas/schema";

const read = (path: string) => readFile(path, "utf8");
const digest = (row: unknown) => createHash("sha256").update(JSON.stringify(row)).digest("hex");
const csvRows = (text: string) => {
  const issues: Array<{ path: string; message: string }> = [];
  const rows = parseCsvRows(text, issues);
  expect(issues).toEqual([]);
  const header = rows[0]!.cells;
  return rows.slice(1).map((row) => Object.fromEntries(header.map((key, i) => [key, row.cells[i] ?? ""])));
};
type RawFact = { entity_code: string; attribute_key: string; value: string; unit: string; status_as_of: string; verification_state: string; evidence_ref: string };
type RawEvidence = { evidence_ref: string; url_check: string; source_type: string; source_url: string };
type Change = { entity_code: string; from: string; to: string };

describe("Batch 19 additive research merge", () => {
  it("preserves every baseline record, with only the nine approved entity status changes", async () => {
    const [seed, originalText, manifestText, changesText, rejectedText, newText] = await Promise.all([
      loadAndValidateSeedDir(), read("tests/fixtures/batch19/baseline-entities.csv"), read("tests/fixtures/batch19/baseline-record-hashes.json"),
      read("data/research/unknowns-batch06/status_changes.json"), read("data/research/unknowns-batch06/status_changes_rejected.json"), read("data/research/central-batch05/entities.csv"),
    ]);
    const oldRows = csvRows(originalText);
    const newRows = csvRows(newText);
    const currentRows = csvRows(await read("data/seed/entities.csv"));
    const changes = JSON.parse(changesText) as Change[];
    const rejected = JSON.parse(rejectedText) as Change[];
    const baseline = JSON.parse(manifestText) as { facts: Record<string,string>; evidence: Record<string,string> };
    expect(oldRows).toHaveLength(448); expect(newRows).toHaveLength(35); expect(seed.entities).toHaveLength(535);
    expect(new Set(seed.entities.map((e) => e.code)).size).toBe(535);
    expect(newRows.every((row) => row.sector === "CENTRAL" && !oldRows.some((old) => old.code === row.code))).toBe(true);
    const subsequent = JSON.parse(await read("data/research/unknowns-batch08/status_changes.json")) as Change[];
    const changeMap = new Map(changes.map((c) => [c.entity_code, c]));
    expect(changeMap.size).toBe(9);
    for (const old of oldRows) {
      const now = currentRows.find((row) => row.code === old.code)!;
      expect(now).toBeDefined();
      const change = changeMap.get(old.code!);
      const later = subsequent.find((entry) => entry.entity_code === old.code);
      expect(now).toEqual({ ...old, status: later?.to ?? change?.to ?? old.status });
      if (change) expect(old.status).toBe("unknown");
    }
    for (const row of newRows) {
      const actual = currentRows.find((item) => item.code === row.code)!;
      for (const key of ["code", "name_ar", "name_en", "entity_type", "sector", "status", "description"]) expect(actual[key]).toBe(row[key]);
    }
    for (const item of rejected) expect(currentRows.find((row) => row.code === item.entity_code)?.status).toBe(subsequent.find((change) => change.entity_code === item.entity_code)?.to ?? "unknown");
    expect(seed.entities.filter((e) => e.status === "unknown" && oldRows.some((row) => row.code === e.code))).toHaveLength(3);
    expect(seed.entities.filter((e) => e.status === "unknown")).toHaveLength(4);
    expect(seed.entities.find((e) => e.code === "TRANSIT-MASPERO-RIVER-PIER")?.status).toBe("unknown");
    for (const table of ["facts", "evidence"] as const) {
      const actual = new Map(seed[table].map((row) => [row.code, row]));
      for (const [code, hash] of Object.entries(baseline[table])) expect(digest(actual.get(code)), `${table} ${code} was removed or changed`).toBe(hash);
    }
  });

  it("preserves each sourced fact and state, and each url_check, without broken references", async () => {
    const seed = await loadAndValidateSeedDir();
    const entities = new Set(seed.entities.map((entity) => entity.code));
    expect(seed.facts.every((fact) => entities.has(fact.entity_code))).toBe(true);
    expect(new Set(seed.facts.map((fact) => fact.code)).size).toBe(seed.facts.length);
    for (const [batch, factCount, evidenceCount] of [["central-batch05", 116, 65], ["unknowns-batch06", 58, 67]] as const) {
      const rawFacts = JSON.parse(await read(`data/research/${batch}/facts.json`)) as RawFact[];
      const sources = JSON.parse(await read(`data/research/${batch}/evidence.json`)) as RawEvidence[];
      expect(rawFacts).toHaveLength(factCount); expect(sources).toHaveLength(evidenceCount);
      for (const source of sources) expect(seed.evidence.find((e) => e.code === source.evidence_ref)?.notes).toContain(`url_check=${source.url_check}`);
      for (const raw of rawFacts) {
        const date = raw.status_as_of ? parsePartialIsoDate(raw.status_as_of) : null;
        const found = seed.facts.filter((f) => f.entity_code === raw.entity_code && f.attribute === raw.attribute_key && f.value === String(raw.value) && f.unit === (raw.unit || null) && f.valid_as_of === (date?.date ?? null) && f.evidence_codes.includes(raw.evidence_ref));
        expect(found, `${batch} ${raw.entity_code} ${raw.attribute_key} ${raw.evidence_ref}`).toHaveLength(1);
        expect(found[0]!.verification_state).toBe(raw.verification_state);
        if (raw.verification_state === "verified") {
          const source = sources.find((e) => e.evidence_ref === raw.evidence_ref)!;
          expect(source.source_type).toBe("official"); expect(source.url_check).toBe("ok"); expect(source.source_url).toBeTruthy();
        }
      }
    }
  });

  it("keeps new entities searchable with geometry only when subsequently matched", async () => {
    const [dataset, text] = await Promise.all([getStaticAtlasDataset(), read("data/research/central-batch05/entities.csv")]);
    const report = JSON.parse(await read("data/research/geometry-batch20/geometry_match_report.json")) as { results: Array<{ entity_code: string; status: string }> };
    const batch20b = JSON.parse(await read("data/research/geometry-batch20b/geometry_match_report.json")) as { results: Array<{ entity_code: string; status: string }> };
    for (const row of csvRows(text)) {
      const entity = dataset.entities.find((e) => e.code === row.code)!;
      const hasGeometry = dataset.features.some((feature) => feature.entity_code === row.code);
      expect(hasGeometry).toBe(report.results.some((result) => result.entity_code === row.code && result.status === "matched") || batch20b.results.some((result) => result.entity_code === row.code && result.status === "matched"));
      const summary = { ...entity, has_geometry: hasGeometry };
      expect(searchEntities([summary], entity.name_ar).some((item) => item.code === entity.code)).toBe(true);
      expect((await getStaticEntityPageData(entity.code))?.code).toBe(entity.code);
    }
  });
});
