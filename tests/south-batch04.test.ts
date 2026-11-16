import path from "node:path";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadAndValidateSeedDir } from "@/lib/atlas/seed";

/**
 * South batch 04 merge invariants.
 *
 * These assert the *shape of the merge* rather than restating the research: the batch is additive, every
 * new row is SOUTH, and the only pre-existing rows that may change are the three approved status moves.
 */
const ROOT = process.cwd();
const SEED_DIR = path.join(ROOT, "data/seed");
const RESEARCH_DIR = path.join(ROOT, "data/research/south-batch04");

/** Entities the batch upgrades from `unknown`; the brief approved exactly these three. */
const APPROVED_STATUS_CHANGES = new Map([
  ["BRIDGE-MONIB", "operational"],
  ["ROAD-EASTERN-DESERT", "operational"],
  ["ROAD-MOKATTAM-AXIS", "operational"],
]);

/** The two new entities that legitimately arrive `unknown` because the research cannot date them. */
const NEW_UNKNOWN_CODES = ["LANDMARK-HELWAN-IRON-STEEL", "LINE-HELWAN-OLD-RAIL"];

const splitCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
};

const readBatchEntities = async (): Promise<Array<Record<string, string>>> => {
  const text = await readFile(path.join(RESEARCH_DIR, "entities.csv"), "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = splitCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]));
  });
};

describe("south batch 04 merge", () => {
  it("adds exactly 31 SOUTH entities with no duplicate or pre-existing codes", async () => {
    const [batch, seed] = await Promise.all([readBatchEntities(), loadAndValidateSeedDir(SEED_DIR)]);

    expect(batch).toHaveLength(31);
    expect(new Set(batch.map((row) => row.code)).size).toBe(31);
    expect(batch.every((row) => row.sector === "SOUTH")).toBe(true);

    const seedCodes = new Set(seed.entities.map((entity) => entity.code));
    for (const row of batch) {
      expect(seedCodes.has(row.code!), `batch entity ${row.code} did not reach the seed`).toBe(true);
    }
    // Nothing in the seed is duplicated, which is the failure mode an append-only merge can produce.
    expect(seedCodes.size).toBe(seed.entities.length);
    expect(seed.entities).toHaveLength(535);
  });

  it("places only matched batch entities from the geometry review", async () => {
    const batch = await readBatchEntities();
    const features = JSON.parse(await readFile(path.join(ROOT, "data/features/features.geojson"), "utf8")) as {
      features: Array<{ properties: { entity_code: string } }>;
    };
    const report = JSON.parse(await readFile(path.join(RESEARCH_DIR, "geometry_match_report.json"), "utf8")) as {
      results: Array<{ entity_code: string; status: string }>;
    };
    const batch20 = JSON.parse(await readFile(path.join(ROOT, "data/research/geometry-batch20/geometry_match_report.json"), "utf8")) as { results: Array<{ entity_code: string; status: string }> };
    const batch20b = JSON.parse(await readFile(path.join(ROOT, "data/research/geometry-batch20b/geometry_match_report.json"), "utf8")) as { results: Array<{ entity_code: string; status: string }> };
    const positioned = new Set(features.features.map((feature) => feature.properties.entity_code));
    expect(report.results).toHaveLength(31);
    for (const row of batch) {
      const result = report.results.find((entry) => entry.entity_code === row.code);
      expect(result).toBeDefined();
      expect(positioned.has(row.code!)).toBe(result!.status === "matched" || batch20.results.some((entry) => entry.entity_code === row.code && entry.status === "matched") || batch20b.results.some((entry) => entry.entity_code === row.code && entry.status === "matched"));
    }
  });

  it("preserves every batch fact and applies the supplied verification states verbatim", async () => {
    const [seed, factsText, evidenceText] = await Promise.all([
      loadAndValidateSeedDir(SEED_DIR),
      readFile(path.join(RESEARCH_DIR, "facts.json"), "utf8"),
      readFile(path.join(RESEARCH_DIR, "evidence.json"), "utf8"),
    ]);
    const batchFacts = JSON.parse(factsText) as Array<{
      entity_code: string;
      attribute_key: string;
      value: string;
      verification_state: string;
      evidence_ref: string;
    }>;
    const batchEvidence = JSON.parse(evidenceText) as Array<{
      evidence_ref: string;
      source_type: string;
      url_check: string;
      source_url: string | null;
    }>;

    expect(batchFacts).toHaveLength(95);
    expect(seed.facts).toHaveLength(2735);
    expect(seed.evidence).toHaveLength(764);

    const seedEvidence = new Map(seed.evidence.map((row) => [row.code, row]));
    const seedFacts = new Set(seed.facts.map((fact) => fact.code));
    const batchEvidenceByRef = new Map(batchEvidence.map((row) => [row.evidence_ref, row]));
    const seedCodes = new Set(seed.entities.map((entity) => entity.code));

    // Every batch fact survives, still points at a real entity, and cites the EV-S4-### evidence.
    for (const fact of batchFacts) {
      expect(seedCodes.has(fact.entity_code), `fact references unknown entity ${fact.entity_code}`).toBe(true);
      const evidence = seedEvidence.get(fact.evidence_ref);
      expect(evidence, `evidence ${fact.evidence_ref} was not carried into the seed`).toBeDefined();
      expect(seedFacts.size).toBe(seed.facts.length);
    }
    for (const evidence of batchEvidence) {
      expect(seedEvidence.has(evidence.evidence_ref)).toBe(true);
      // `url_check` has no column, so it must survive inside the note instead of being dropped.
      // (`notes` is the canonical column name, and the research note already carries the marker itself,
      //  which is why the merge only appends it when it is missing.)
      expect(seedEvidence.get(evidence.evidence_ref)?.notes ?? "").toContain(`url_check=${evidence.url_check}`);
    }

    // No fact is upgraded or downgraded: the supplied split is 48 verified / 47 single_source.
    const s4Facts = seed.facts.filter((fact) =>
      batchEvidence.some((evidence) => evidence.evidence_ref === fact.evidence_codes[0]),
    );
    expect(s4Facts).toHaveLength(95);
    expect(s4Facts.filter((fact) => fact.verification_state === "verified")).toHaveLength(
      batchFacts.filter((fact) => fact.verification_state === "verified").length,
    );
    expect(s4Facts.filter((fact) => fact.verification_state === "verified")).toHaveLength(48);

    // Only official + url_check=ok rows may be verified.
    for (const fact of batchFacts) {
      if (fact.verification_state !== "verified") continue;
      const evidence = batchEvidenceByRef.get(fact.evidence_ref)!;
      expect(evidence.source_type).toBe("official");
      expect(evidence.url_check).toBe("ok");
      expect(evidence.source_url).toBeTruthy();
    }
  });

  it("applies the three approved status changes and leaves every other status alone", async () => {
    const [seed, statusText] = await Promise.all([
      loadAndValidateSeedDir(SEED_DIR),
      readFile(path.join(RESEARCH_DIR, "status_changes.json"), "utf8"),
    ]);
    const statusChanges = JSON.parse(statusText) as Array<{ entity_code: string; from: string; to: string }>;
    expect(statusChanges).toHaveLength(3);

    const byCode = new Map(seed.entities.map((entity) => [entity.code, entity]));
    for (const change of statusChanges) {
      expect(APPROVED_STATUS_CHANGES.get(change.entity_code), `${change.entity_code} was not approved`).toBe(change.to);
      expect(change.from).toBe("unknown");
      expect(byCode.get(change.entity_code)?.status).toBe(change.to);
      // The delta moves status only; the research brief forbids touching sector.
      expect(byCode.get(change.entity_code)?.sector).toBe("SOUTH");
    }
  });

  it("retains the South unknown not resolved by the subsequent batch", async () => {
    const seed = await loadAndValidateSeedDir(SEED_DIR);
    const batchCodes = new Set((await readBatchEntities()).map((row) => row.code!));
    const unknown = seed.entities.filter((entity) => entity.status === "unknown");

    expect(unknown.filter((entity) => !batchCodes.has(entity.code))).toHaveLength(3);
    expect(unknown).toHaveLength(4);
    expect(unknown.filter((entity) => batchCodes.has(entity.code)).map((entity) => entity.code).sort()).toEqual(
      NEW_UNKNOWN_CODES.filter((code) => code !== "LINE-HELWAN-OLD-RAIL").sort(),
    );
  });
});
