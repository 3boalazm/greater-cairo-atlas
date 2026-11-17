import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parsePartialIsoDate } from "@/lib/atlas/schema";
import { loadAndValidateSeedDir, parseCsvRows } from "@/lib/atlas/seed";
import { getStaticAtlasDataset, getStaticEntityPageData, getExportMetadata } from "@/lib/atlas/static-dataset";
import { searchEntities } from "@/lib/atlas/search";

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
const batches = [["west-batch07", 27, 138, 68, "WEST"], ["north-batch07", 25, 121, 82, "NORTH"]] as const;

describe("Batch 22 additive research", () => {
  it("retains every upstream research file byte-for-byte", async () => {
    const hashes = JSON.parse(await read("tests/fixtures/batch22/source-hashes.json")) as Record<string, string>;
    expect(Object.keys(hashes)).toHaveLength(24);
    for (const [path, expected] of Object.entries(hashes)) {
      expect(createHash("sha256").update(await readFile(path)).digest("hex"), path).toBe(expected);
    }
  });

  it("preserves existing entities, facts and evidence and adds the 52 unique entities", async () => {
    const seed = await loadAndValidateSeedDir();
    const oldRows = csvRows(await read("tests/fixtures/batch22/baseline-entities.csv"));
    const currentRows = csvRows(await read("data/seed/entities.csv"));
    const baseline = JSON.parse(await read("tests/fixtures/batch22/baseline-record-hashes.json")) as { facts: Record<string, string>; evidence: Record<string, string> };
    expect(oldRows).toHaveLength(483); expect(currentRows).toHaveLength(564);
    expect(new Set(currentRows.map((r) => r.code)).size).toBe(564);
    const laterChanges = JSON.parse(await read("data/research/unknowns-batch08/status_changes.json")) as Array<{ entity_code: string; from: string; to: string }>;
    for (const row of oldRows) {
      const change = laterChanges.find((item) => item.entity_code === row.code);
      expect(currentRows.find((r) => r.code === row.code)).toEqual({ ...row, status: change?.to ?? row.status });
      if (change) expect(row.status).toBe(change.from);
    }
    for (const [batch, count, , , sector] of batches) {
      const rows = csvRows(await read(`data/research/${batch}/entities.csv`));
      expect(rows).toHaveLength(count);
      for (const row of rows) {
        expect(oldRows.some((old) => old.code === row.code)).toBe(false);
        expect(row.sector).toBe(sector);
        const actual = currentRows.find((item) => item.code === row.code)!;
        for (const key of ["code", "name_ar", "name_en", "entity_type", "sector", "description"]) expect(actual[key], `${row.code} ${key}`).toBe(row[key]);
        const change = laterChanges.find((item) => item.entity_code === row.code);
        expect(actual.status).toBe(change?.to ?? row.status);
      }
    }
    for (const table of ["facts", "evidence"] as const) {
      const actual = new Map(seed[table].map((row) => [row.code, row]));
      for (const [code, hash] of Object.entries(baseline[table])) expect(digest(actual.get(code)), `${table} ${code}`).toBe(hash);
    }
    expect(seed.facts).toHaveLength(2849); expect(seed.evidence).toHaveLength(810);
    expect(seed.facts.reduce((sum, fact) => sum + fact.evidence_codes.length, 0)).toBe(3202);
    expect(new Set(seed.facts.map((f) => f.code)).size).toBe(seed.facts.length);
    expect(new Set(seed.evidence.map((e) => e.code)).size).toBe(seed.evidence.length);
    const entityCodes = new Set(seed.entities.map((e) => e.code)), evidenceCodes = new Set(seed.evidence.map((e) => e.code));
    expect(seed.facts.every((f) => entityCodes.has(f.entity_code) && f.evidence_codes.every((code) => evidenceCodes.has(code)))).toBe(true);
  });

  it("preserves every supplied fact, state, evidence link, url check and cross-batch reference", async () => {
    const seed = await loadAndValidateSeedDir();
    for (const [batch, , factCount, evidenceCount] of batches) {
      const rawFacts = JSON.parse(await read(`data/research/${batch}/facts.json`)) as RawFact[];
      const rawEvidence = JSON.parse(await read(`data/research/${batch}/evidence.json`)) as RawEvidence[];
      expect(rawFacts).toHaveLength(factCount); expect(rawEvidence).toHaveLength(evidenceCount);
      for (const raw of rawEvidence) {
        const actual = seed.evidence.find((e) => e.code === raw.evidence_ref)!;
        expect(actual.notes).toContain(`url_check=${raw.url_check}`);
        expect(actual.url).toBe(raw.source_url || null);
        expect(actual.source_type).toBe(raw.source_type === "data" ? "dataset" : raw.source_type);
        if (raw.source_type === "data") expect(actual.notes).toContain("source_type_original=data");
      }
      for (const raw of rawFacts) {
        const renamed = /^6october_separator_(length|width)$/.test(raw.attribute_key);
        const attribute = renamed ? `attr_${raw.attribute_key}` : raw.attribute_key;
        const date = raw.status_as_of ? parsePartialIsoDate(raw.status_as_of) : null;
        const found = seed.facts.filter((f) => f.entity_code === raw.entity_code && f.attribute === attribute && f.value === String(raw.value) && f.unit === (raw.unit || null) && f.valid_as_of === (date?.date ?? null) && f.evidence_codes.includes(raw.evidence_ref));
        expect(found, `${raw.entity_code} ${raw.attribute_key} ${raw.evidence_ref}`).toHaveLength(1);
        expect(found[0]!.verification_state).toBe(raw.verification_state);
        if (date) expect(found[0]!.valid_as_of_precision).toBe(date.precision);
        if (renamed) expect(found[0]!.notes).toContain(`source_attribute_key=${raw.attribute_key}`);
        if (raw.verification_state === "verified") {
          const source = rawEvidence.find((e) => e.evidence_ref === raw.evidence_ref)!;
          expect(source.source_type).toBe("official"); expect(source.url_check).toBe("ok"); expect(source.source_url).toBeTruthy();
        }
      }
    }
    const cross = seed.facts.filter((f) => f.entity_code === "PROJ-WARRAQ-ISLAND-DEV" && f.evidence_codes.some((e) => e.startsWith("EV-N7-")));
    expect(cross.length).toBeGreaterThan(0);
  });

  it("records all seven exact-value overlaps without erasing claim metadata", async () => {
    const seed = await loadAndValidateSeedDir();
    const report = JSON.parse(await read("data/research/batch22-overlaps.json")) as { baseline_overlap_rows: number; cross_batch_overlap_rows: number; attached: number; overlaps: Array<{ entity_code: string; attribute: string; value: string; incoming_evidence: string[]; prior_fact_codes: string[]; action: string }> };
    expect(report.baseline_overlap_rows).toBe(6); expect(report.cross_batch_overlap_rows).toBe(1); expect(report.attached).toBe(0); expect(report.overlaps).toHaveLength(7);
    for (const entry of report.overlaps) {
      expect(entry.action).toBe("retain_separate_fact");
      const incoming = seed.facts.find((f) => f.entity_code === entry.entity_code && f.attribute === entry.attribute && f.value === entry.value && entry.incoming_evidence.every((ref) => f.evidence_codes.includes(ref)))!;
      expect(incoming).toBeDefined();
      for (const code of entry.prior_fact_codes) {
        const prior = seed.facts.find((f) => f.code === code)!;
        expect(prior.entity_code).toBe(incoming.entity_code); expect(prior.attribute).toBe(incoming.attribute); expect(prior.value).toBe(incoming.value);
        expect([prior.unit, prior.valid_as_of, prior.valid_as_of_precision, prior.verification_state, prior.notes]).not.toEqual([incoming.unit, incoming.valid_as_of, incoming.valid_as_of_precision, incoming.verification_state, incoming.notes]);
      }
    }
  });

  it("keeps new entities searchable, filterable by sector and available without geometry", async () => {
    const [dataset, metadata] = await Promise.all([getStaticAtlasDataset(), getExportMetadata()]);
    expect(metadata.counts.entities).toBe(dataset.entities.length); expect(metadata.counts.facts).toBe(dataset.facts.length);
    expect(metadata.counts.evidence).toBe(dataset.evidence.length); expect(metadata.counts.fact_evidence).toBe(dataset.factEvidence.length);
    const batch20b = JSON.parse(await read("data/research/geometry-batch20b/geometry_match_report.json")) as { results: Array<{ entity_code: string; status: string }> };
    const mapped = new Set(batch20b.results.filter((entry) => entry.status === "matched").map((entry) => entry.entity_code));
    const batch26 = new Set(JSON.parse(await read("data/research/geometry-batch26/accepts.json")).accepts.map((a: { entity_code: string }) => a.entity_code));
    const hasGeometry = (code: string) => mapped.has(code) || batch26.has(code);
    for (const [batch, count, , , sector] of batches) {
      const rows = csvRows(await read(`data/research/${batch}/entities.csv`));
      const codes = new Set(rows.map((row) => row.code));
      expect(dataset.entities.filter((e) => codes.has(e.code) && e.sector === sector)).toHaveLength(count);
      for (const row of rows) {
        const entity = dataset.entities.find((e) => e.code === row.code)!;
        expect(dataset.features.some((f) => f.entity_code === entity.code)).toBe(hasGeometry(entity.code));
        const summary = { ...entity, has_geometry: hasGeometry(entity.code) };
        expect(searchEntities([summary], entity.name_ar).some((item) => item.code === entity.code)).toBe(true);
        const detail = await getStaticEntityPageData(entity.code);
        expect(detail?.code).toBe(entity.code); expect(Boolean(detail?.mapGeometry)).toBe(hasGeometry(entity.code));
      }
    }
  });
});
