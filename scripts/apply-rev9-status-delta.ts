import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  adaptResearchSeedSources,
  buildDeterministicFactCode,
} from "../src/lib/atlas/research-seed";
import {
  escapeCsvCell,
  loadAndValidateSeedDir,
  serializeEntitiesCsv,
  validateSeedSources,
} from "../src/lib/atlas/seed";
import type { EntitySeed, EvidenceSeed, FactSeed } from "../src/lib/atlas/schema";

const ROOT = process.cwd();
const RESEARCH_DIR = path.join(ROOT, "data/research/rev9-status");
const SEED_DIR = path.join(ROOT, "data/seed");
const EXPECTED_STATUS_CHANGES = new Map([
  ["ROAD-AMR-IBN-ALAS", "operational"],
  ["ROAD-REGIONAL-NW-ARC", "operational"],
  ["TRANSIT-SUPERJET", "operational"],
]);

interface StatusChange {
  entity_code: string;
  from: string;
  to: string;
  basis: string[];
  caveat?: string;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function csvCell(value: string): string {
  return escapeCsvCell(value);
}

async function main(): Promise<void> {
  const [current, evidenceText, factsText, statusText] = await Promise.all([
    loadAndValidateSeedDir(SEED_DIR),
    readFile(path.join(RESEARCH_DIR, "evidence_rev9.json"), "utf8"),
    readFile(path.join(RESEARCH_DIR, "facts_rev9.json"), "utf8"),
    readFile(path.join(RESEARCH_DIR, "status_changes_rev9.json"), "utf8"),
  ]);
  const incomingEvidence = JSON.parse(evidenceText) as Array<Record<string, unknown>>;
  const incomingFacts = JSON.parse(factsText) as Array<Record<string, unknown>>;
  const statusChanges = JSON.parse(statusText) as StatusChange[];

  if (incomingEvidence.length !== 6 || incomingFacts.length !== 9) {
    throw new Error(`rev9 must contain exactly 6 evidence rows and 9 facts; found ${incomingEvidence.length} and ${incomingFacts.length}.`);
  }
  if (statusChanges.length !== EXPECTED_STATUS_CHANGES.size ||
      statusChanges.some((change) => EXPECTED_STATUS_CHANGES.get(change.entity_code) !== change.to || change.from !== "unknown")) {
    throw new Error("rev9 status changes do not match the three approved unknown → operational transitions.");
  }
  const evidenceRefs = incomingEvidence.map((item) => String(item.evidence_ref ?? ""));
  if (evidenceRefs.some((ref) => !/^EV-R9-\d{3}$/.test(ref)) || new Set(evidenceRefs).size !== 6) {
    throw new Error("All rev9 evidence refs must be unique EV-R9-### identifiers.");
  }
  const oldEvidenceCodes = new Set(current.evidence.map((item) => item.code));
  const collisions = evidenceRefs.filter((ref) => oldEvidenceCodes.has(ref));
  if (collisions.length) {
    const alreadyApplied = collisions.length === evidenceRefs.length &&
      statusChanges.every((change) => current.entities.find((entity) => entity.code === change.entity_code)?.status === change.to) &&
      current.entities.filter((entity) => entity.status === "unknown").length === 14 &&
      current.facts.filter((fact) => fact.evidence_codes.some((ref) => evidenceRefs.includes(ref))).length === 9;
    if (!alreadyApplied) throw new Error(`Rev9 evidence refs collide with canonical evidence: ${collisions.join(", ")}`);
    console.info("Rev9 status delta is already present in the canonical seed; no files changed.");
    return;
  }

  const entitiesByCode = new Map(current.entities.map((entity) => [entity.code, entity]));
  const updatedEntities = current.entities.map((entity) => ({ ...entity }));
  for (const change of statusChanges) {
    const index = updatedEntities.findIndex((entity) => entity.code === change.entity_code);
    const entity = updatedEntities[index];
    if (!entity || entity.status !== change.from || !change.basis.every((ref) => evidenceRefs.includes(ref))) {
      throw new Error(`Invalid status delta for ${change.entity_code}: expected current ${change.from} and valid evidence basis.`);
    }
    updatedEntities[index] = { ...entity, status: change.to as EntitySeed["status"] };
  }

  // Adapt the immutable research-format files using the canonical research-seed adapter.
  // Supplying only the affected entities keeps this additive patch separate from prior facts.
  const researchEntitiesCsv = [
    "entity_code,entity_type,canonical_name_ar,canonical_name_en,aliases,sector_code,status,description",
    ...statusChanges.map((change) => {
      const entity = entitiesByCode.get(change.entity_code)!;
      return [entity.code, entity.entity_type, entity.name_ar, entity.name_en, entity.aliases.join("|"), entity.sector, change.to, entity.description ?? ""].map(csvCell).join(",");
    }),
    "",
  ].join("\n");
  const adapted = adaptResearchSeedSources({
    entitiesCsv: researchEntitiesCsv,
    evidenceJsonText: evidenceText,
    factsJsonText: factsText,
    selectedRevision: "rev9-status-delta",
  });
  if (!adapted.ok || !adapted.bundle || !adapted.serialized) {
    throw new Error(`rev9 adapter validation failed:\n${adapted.report.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}`);
  }
  if (adapted.bundle.evidence.length !== 6 || adapted.bundle.facts.length !== 9) {
    throw new Error("Adapter output did not preserve the expected six evidence records and nine fact rows.");
  }

  // Adapter fact sequence numbers are deterministic within the patch. Advance them beyond
  // existing canonical sequences so the additive merge cannot overwrite earlier claims.
  const existingFactCodes = new Set(current.facts.map((fact) => fact.code));
  const nextSequence = new Map<string, number>();
  const mergedFacts: FactSeed[] = [];
  for (const fact of adapted.bundle.facts) {
    const group = `${fact.entity_code}\u0000${fact.attribute}`;
    const existingForGroup = current.facts.filter((old) => old.entity_code === fact.entity_code && old.attribute === fact.attribute);
    const currentNext = nextSequence.get(group) ?? (existingForGroup.length + 1);
    let sequence = currentNext;
    let code = buildDeterministicFactCode(fact.entity_code, fact.attribute, sequence);
    while (existingFactCodes.has(code)) code = buildDeterministicFactCode(fact.entity_code, fact.attribute, ++sequence);
    nextSequence.set(group, sequence + 1);
    existingFactCodes.add(code);
    mergedFacts.push({ ...fact, code });
  }
  if (mergedFacts.some((fact) => fact.verification_state === "verified")) {
    throw new Error("rev9 includes a verified fact; none has official evidence.");
  }

  const mergedEvidence: EvidenceSeed[] = [...current.evidence, ...adapted.bundle.evidence];
  const allFacts = [...current.facts, ...mergedFacts];
  const validated = validateSeedSources({
    entitiesCsv: serializeEntitiesCsv(updatedEntities),
    evidenceJsonText: json(mergedEvidence),
    factsJsonText: json(allFacts),
  });
  if (validated.entities.filter((entity) => entity.status === "unknown").length !== 14) {
    throw new Error("Expected exactly 14 unknown-status entities after rev9.");
  }
  if (validated.entities.length !== current.entities.length || allFacts.length !== current.facts.length + 9 || mergedEvidence.length !== current.evidence.length + 6) {
    throw new Error("Unexpected non-additive changes in rev9 merge.");
  }

  await Promise.all([
    writeFile(path.join(SEED_DIR, "entities.csv"), serializeEntitiesCsv(updatedEntities), "utf8"),
    writeFile(path.join(SEED_DIR, "evidence.json"), json(mergedEvidence), "utf8"),
    writeFile(path.join(SEED_DIR, "facts.json"), json(allFacts), "utf8"),
    writeFile(path.join(RESEARCH_DIR, "evidence_rev9_adapted.json"), adapted.serialized.evidenceJsonText, "utf8"),
    writeFile(path.join(RESEARCH_DIR, "facts_rev9_adapted.json"), json(mergedFacts), "utf8"),
    writeFile(path.join(RESEARCH_DIR, "ADAPTATION_NOTES.md"), [
      "# rev9 status delta adaptation",
      "",
      "- Raw `README.md`, `evidence_rev9.json`, `facts_rev9.json`, and `status_changes_rev9.json` were copied unchanged from `research/rev9-status`.",
      "- The research-format evidence and facts were converted with `adaptResearchSeedSources`; canonical evidence refs remain in the `EV-R9-###` namespace.",
      "- The three status changes were applied additively to `data/seed/entities.csv`; no other entity status changed.",
      "- Nine adapted facts and six adapted news evidence rows were appended to the canonical seed. Existing facts and evidence were retained unchanged.",
      "- Adapter-generated fact codes were sequenced after existing facts for the same entity/attribute to prevent identifier collisions.",
      "- All rev9 facts retain their supplied `corroborated`/`single_source` verification state; no claim is marked `verified`.",
      "- `maintenance_closure` is displayed only in the existing researcher-only claim/source sections.",
      "",
    ].join("\n"), "utf8"),
  ]);
  console.info(`Applied rev9 status delta: ${validated.entities.length} entities (${validated.entities.filter((entity) => entity.status === "unknown").length} unknown), ${mergedEvidence.length} evidence records, ${allFacts.length} facts.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
