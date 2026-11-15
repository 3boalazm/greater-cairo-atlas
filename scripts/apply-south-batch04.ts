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
import type { EntitySeed, EvidenceSeed, FactSeed, FactVerificationState } from "../src/lib/atlas/schema";

/**
 * BATCH 15 — merge South sector research batch 04 into the canonical seed.
 *
 * Additive only. Nothing is deleted, no existing status or sector is rewritten, and no coordinate is
 * invented. Every number this script asserts is stated up front so a silent drift fails the run rather
 * than producing a plausible-looking seed.
 */
const ROOT = process.cwd();
const RESEARCH_DIR = path.join(ROOT, "data/research/south-batch04");
const SEED_DIR = path.join(ROOT, "data/seed");

/** The batch as curated. If any of these change, the researcher has to re-approve the numbers. */
const EXPECTED = {
  newEntities: 31,
  facts: 95,
  evidence: 70,
  statusChanges: 3,
  unknownBefore: 14,
  unknownOriginalsAfter: 11,
  totalUnknownAfter: 13,
} as const;

const APPROVED_STATUS_CHANGES = new Map([
  ["BRIDGE-MONIB", "operational"],
  ["ROAD-EASTERN-DESERT", "operational"],
  ["ROAD-MOKATTAM-AXIS", "operational"],
]);

interface StatusChange {
  entity_code: string;
  from: string;
  to: string;
  basis: string[];
  caveat?: string;
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const csvCell = (value: string): string => escapeCsvCell(value);

/**
 * The batch's `entities.csv` is in **seed** format (`code,name_ar,…`), while the canonical adapter reads
 * the **research** format (`entity_code,canonical_name_ar,…`). Rather than fork the adapter or special-case
 * its parser, this converts the header/fields with a strict explicit mapping and fails on anything that
 * does not round-trip. The raw file itself is never modified.
 */
function seedCsvToResearchCsv(seedCsv: string, expectedRows: number): string {
  const lines = seedCsv.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = splitCsvLine(lines[0]!);
  const required = ["code", "name_ar", "name_en", "entity_type", "sector", "status", "aliases", "description"];
  if (header.length !== required.length || required.some((name, index) => header[index] !== name)) {
    throw new Error(`Unexpected entities.csv header: ${header.join(",")}`);
  }
  const rows = lines.slice(1);
  if (rows.length !== expectedRows) throw new Error(`Expected ${expectedRows} entity rows, found ${rows.length}.`);

  // Map by header name, never by position: the seed order is `code,name_ar,name_en,entity_type,sector,status,…`
  // while the research order is `entity_code,entity_type,canonical_name_ar,…`. Copying cells positionally
  // silently shifts every column (which is exactly what produced "Invalid entity_type <Arabic description>").
  const researchHeader = ["entity_code", "entity_type", "canonical_name_ar", "canonical_name_en", "aliases", "sector_code", "status", "description"];
  const sourceKey: Record<string, string> = {
    entity_code: "code",
    entity_type: "entity_type",
    canonical_name_ar: "name_ar",
    canonical_name_en: "name_en",
    aliases: "aliases",
    sector_code: "sector", // research calls the sector column `sector_code`; the seed calls it `sector`
    status: "status",
    description: "description",
  };
  const out = [researchHeader.join(",")];
  for (const line of rows) {
    const cells = splitCsvLine(line);
    if (cells.length !== required.length) {
      throw new Error(`Expected ${required.length} cells in entities.csv row, found ${cells.length}: ${line.slice(0, 60)}…`);
    }
    const byName = new Map(required.map((name, index) => [name, cells[index]!]));
    out.push(researchHeader.map((name) => escapeCsvCell(byName.get(sourceKey[name]!)!)).join(","));
  }
  return out.join("\n") + "\n";
}

/** Minimal RFC-4180 field split: honours double quotes so an embedded comma can never shift columns. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') { cell += '"'; index += 1; }
        else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { cells.push(cell); cell = ""; }
    else cell += char;
  }
  cells.push(cell);
  return cells;
}

/**
 * `url_check` has no column in the evidence schema, so it is preserved in the human-readable `note`
 * instead of being dropped — losing it would discard the one piece of information that says whether a
 * `verified` claim's link was actually opened.
 */
function foldUrlCheckIntoNote(row: Record<string, unknown>): Record<string, unknown> {
  const { url_check: urlCheck, ...rest } = row;
  if (typeof urlCheck !== "string" || urlCheck === "") return rest;
  const note = typeof rest.note === "string" ? rest.note : "";
  // Idempotent: a note that already carries the marker is not annotated twice.
  if (note.includes("url_check=")) return rest;
  return { ...rest, note: note ? `${note} · url_check=${urlCheck}` : `url_check=${urlCheck}` };
}

async function main(): Promise<void> {
  const [current, entitiesCsv, evidenceText, factsText, statusText] = await Promise.all([
    loadAndValidateSeedDir(SEED_DIR),
    readFile(path.join(RESEARCH_DIR, "entities.csv"), "utf8"),
    readFile(path.join(RESEARCH_DIR, "evidence.json"), "utf8"),
    readFile(path.join(RESEARCH_DIR, "facts.json"), "utf8"),
    readFile(path.join(RESEARCH_DIR, "status_changes.json"), "utf8"),
  ]);

  const incomingEvidenceRaw = JSON.parse(evidenceText) as Array<Record<string, unknown>>;
  const incomingFactsRaw = JSON.parse(factsText) as Array<Record<string, unknown>>;
  const statusChanges = JSON.parse(statusText) as StatusChange[];

  // ---- guard rails before anything is written -------------------------------------------------
  if (incomingEvidenceRaw.length !== EXPECTED.evidence) {
    throw new Error(`South batch 04 must contain ${EXPECTED.evidence} evidence rows; found ${incomingEvidenceRaw.length}.`);
  }
  if (incomingFactsRaw.length !== EXPECTED.facts) {
    throw new Error(`South batch 04 must contain ${EXPECTED.facts} facts; found ${incomingFactsRaw.length}.`);
  }
  if (statusChanges.length !== EXPECTED.statusChanges) {
    throw new Error(`South batch 04 must contain ${EXPECTED.statusChanges} status changes; found ${statusChanges.length}.`);
  }
  for (const change of statusChanges) {
    if (change.from !== "unknown" || APPROVED_STATUS_CHANGES.get(change.entity_code) !== change.to) {
      throw new Error(`Unapproved status change for ${change.entity_code}: ${change.from} → ${change.to}.`);
    }
  }
  const evidenceRefs = incomingEvidenceRaw.map((row) => String(row.evidence_ref ?? ""));
  if (evidenceRefs.length !== new Set(evidenceRefs).size) throw new Error("Duplicate evidence_ref in the batch.");
  if (evidenceRefs.some((ref) => !/^EV-S4-\d{3}$/.test(ref))) {
    throw new Error("All evidence refs must be unique EV-S4-### identifiers.");
  }

  const existingEntityCodes = new Set(current.entities.map((entity) => entity.code));
  const existingEvidenceCodes = new Set(current.evidence.map((row) => row.code));
  const collisions = evidenceRefs.filter((ref) => existingEvidenceCodes.has(ref));

  const alreadyApplied = collisions.length === evidenceRefs.length &&
    statusChanges.every((change) => current.entities.find((entity) => entity.code === change.entity_code)?.status === change.to);
  if (alreadyApplied) {
    console.info("South batch 04 is already present in the canonical seed; no files changed.");
    return;
  }
  if (collisions.length) {
    throw new Error(`South batch 04 evidence refs collide with canonical evidence: ${collisions.join(", ")}`);
  }

  // Any NEW entity code that already exists is a hard failure, per the brief.
  const researchEntitiesCsv = seedCsvToResearchCsv(entitiesCsv, EXPECTED.newEntities);
  const newCodes = entitiesCsv.split(/\r?\n/).slice(1).filter((line) => line.trim() !== "").map((line) => splitCsvLine(line)[0]!);
  const duplicateNewCodes = newCodes.filter((code, index) => newCodes.indexOf(code) !== index);
  if (duplicateNewCodes.length) throw new Error(`Duplicate codes inside the batch: ${duplicateNewCodes.join(", ")}`);
  const existingNewCodes = newCodes.filter((code) => existingEntityCodes.has(code));
  if (existingNewCodes.length) {
    throw new Error(`These batch entity codes already exist in the seed: ${existingNewCodes.join(", ")}`);
  }

  /**
   * The batch's facts do not only describe its own 31 new entities — several are evidence for the three
   * status changes and for already-seeded SOUTH entities (`ROAD-EASTERN-DESERT`, `TRANSIT-BRT`, …).
   * The adapter validates every `entity_code` against the CSV it is given, so those existing entities
   * are supplied for validation only and are filtered out again below; nothing about them is rewritten
   * here (their one approved field change is the status delta applied further down).
   */
  const newCodeSet = new Set(newCodes);
  const referencedExistingCodes = [
    ...new Set(
      incomingFactsRaw
        .map((row) => String(row.entity_code ?? ""))
        .filter((code) => code !== "" && !newCodeSet.has(code)),
    ),
  ];
  const missingFromSeed = referencedExistingCodes.filter((code) => !existingEntityCodes.has(code));
  if (missingFromSeed.length) {
    throw new Error(`Batch facts reference entities that exist neither in the batch nor in the seed: ${missingFromSeed.join(", ")}`);
  }

  const referenceRows = referencedExistingCodes.map((code) => {
    const entity = current.entities.find((item) => item.code === code)!;
    return [
      entity.code,
      entity.entity_type,
      entity.name_ar,
      entity.name_en,
      entity.aliases.join("|"),
      entity.sector,
      entity.status,
      entity.description ?? "",
    ].map(csvCell).join(",");
  });
  // One header at the top, then the batch rows and the reference rows that share the same columns.
  const adapterEntitiesCsv = [...researchEntitiesCsv.trimEnd().split("\n"), ...referenceRows].join("\n") + "\n";

  // ---- adapt the research-format files through the canonical adapter -------------------------
  const adapted = adaptResearchSeedSources({
    entitiesCsv: adapterEntitiesCsv,
    // Feed the evidence through the adapter after folding url_check into the note; the adapter's key
    // allow-list is strict and would otherwise reject the raw row.
    evidenceJsonText: json(incomingEvidenceRaw.map(foldUrlCheckIntoNote)),
    factsJsonText: factsText,
    selectedRevision: "south-batch04",
  });
  if (!adapted.ok || !adapted.bundle || !adapted.serialized) {
    throw new Error(`South batch 04 adapter validation failed:\n${adapted.report.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}`);
  }
  if (adapted.bundle.facts.length !== EXPECTED.facts ||
      adapted.bundle.evidence.length !== EXPECTED.evidence) {
    throw new Error("Adapter did not preserve the expected fact and evidence counts.");
  }
  const adaptedNewEntities = adapted.bundle.entities.filter((entity) => newCodeSet.has(entity.code));
  if (adaptedNewEntities.length !== EXPECTED.newEntities) {
    throw new Error(`Adapter returned ${adaptedNewEntities.length} new entities; expected ${EXPECTED.newEntities}.`);
  }

  /**
   * Verification states are carried through exactly as supplied. The README and the brief both say only
   * official + url_check=ok rows are `verified`, so this checks that invariant instead of re-deriving it —
   * if a future batch downgrades a row by accident, this fails rather than quietly publishing it.
   */
  // The adapter re-sorts facts (value, unit, evidence, status_as_of, notes) before assigning codes, so
  // `bundle.facts[i]` is NOT `facts.json[i]`. Match on the full identity instead of trusting the index.
  const suppliedByIdentity = new Map(
    incomingFactsRaw.map((row) => [
      JSON.stringify([
        String(row.entity_code ?? ""),
        String(row.attribute_key ?? ""),
        String(row.value ?? ""),
        row.unit === null || row.unit === undefined ? "" : String(row.unit),
        String(row.status_as_of ?? ""),
      ]),
      row,
    ]),
  );
  const evidenceByRef = new Map(incomingEvidenceRaw.map((row) => [String(row.evidence_ref), row]));
  for (const fact of adapted.bundle.facts) {
    const supplied = suppliedByIdentity.get(
      JSON.stringify([
        fact.entity_code,
        fact.attribute,
        String(fact.value),
        fact.unit === null ? "" : String(fact.unit),
        fact.valid_as_of ?? "",
      ]),
    );
    if (!supplied) {
      throw new Error(`Adapted fact ${fact.code} has no matching row in facts.json (identity mismatch).`);
    }
    const suppliedState = String(supplied.verification_state) as FactVerificationState;
    if (fact.verification_state !== suppliedState) {
      throw new Error(`Fact ${fact.code} was adapted to ${fact.verification_state} but supplied as ${suppliedState}.`);
    }
    if (suppliedState === "verified") {
      const evidence = evidenceByRef.get(String(supplied.evidence_ref));
      const qualifies = evidence?.source_type === "official" && evidence?.url_check === "ok" && typeof evidence?.source_url === "string";
      if (!qualifies) {
        throw new Error(`Fact ${fact.code} claims verified but its evidence is not official + url_check=ok with a URL.`);
      }
    }
  }

  // ---- append entities (all SOUTH, exactly as supplied) --------------------------------------
  const adaptedEntities: EntitySeed[] = adaptedNewEntities;
  if (adaptedEntities.some((entity) => entity.sector !== "SOUTH")) {
    throw new Error("Every entity in South batch 04 must be in the SOUTH sector.");
  }
  const mergedEntities: EntitySeed[] = [...current.entities, ...adaptedEntities];

  // ---- apply the three approved status changes additively ------------------------------------
  const changedEntities = mergedEntities.map((entity) => {
    const change = statusChanges.find((item) => item.entity_code === entity.code);
    if (!change) return entity;
    if (entity.status !== change.from) {
      throw new Error(`Cannot apply status change for ${entity.code}: expected ${change.from}, found ${entity.status}.`);
    }
    // Only the status changes; sector, geometry and every other field are untouched.
    return { ...entity, status: change.to as EntitySeed["status"] };
  });

  // ---- append evidence and facts, sequencing fact codes past existing ones -------------------
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

  const mergedEvidence: EvidenceSeed[] = [...current.evidence, ...adapted.bundle.evidence];
  const allFacts = [...current.facts, ...mergedFacts];

  // ---- validate the whole bundle before writing ---------------------------------------------
  const validated = validateSeedSources({
    entitiesCsv: serializeEntitiesCsv(changedEntities),
    evidenceJsonText: json(mergedEvidence),
    factsJsonText: json(allFacts),
  });

  const unknownOriginal = validated.entities.filter((entity) => entity.status === "unknown" && existingEntityCodes.has(entity.code));
  const unknownNew = validated.entities.filter((entity) => entity.status === "unknown" && !existingEntityCodes.has(entity.code));
  if (unknownOriginal.length !== EXPECTED.unknownOriginalsAfter) {
    throw new Error(`Expected ${EXPECTED.unknownOriginalsAfter} pre-existing unknown-status entities after the merge; found ${unknownOriginal.length}.`);
  }
  if (unknownNew.length !== EXPECTED.totalUnknownAfter - EXPECTED.unknownOriginalsAfter) {
    throw new Error(`Expected ${EXPECTED.totalUnknownAfter - EXPECTED.unknownOriginalsAfter} new unknown-status entities; found ${unknownNew.length}.`);
  }
  if (validated.entities.length !== current.entities.length + EXPECTED.newEntities) {
    throw new Error("Unexpected non-additive entity change.");
  }
  if (allFacts.length !== current.facts.length + EXPECTED.facts || mergedEvidence.length !== current.evidence.length + EXPECTED.evidence) {
    throw new Error("Unexpected non-additive fact or evidence change.");
  }
  // Nothing may be lost: every original entity, fact and evidence code must still be present.
  for (const entity of current.entities) if (!validated.entities.some((row) => row.code === entity.code)) throw new Error(`Entity ${entity.code} disappeared.`);
  for (const fact of current.facts) if (!allFacts.some((row) => row.code === fact.code)) throw new Error(`Fact ${fact.code} disappeared.`);
  for (const evidence of current.evidence) if (!mergedEvidence.some((row) => row.code === evidence.code)) throw new Error(`Evidence ${evidence.code} disappeared.`);

  await Promise.all([
    writeFile(path.join(SEED_DIR, "entities.csv"), serializeEntitiesCsv(changedEntities), "utf8"),
    writeFile(path.join(SEED_DIR, "evidence.json"), json(mergedEvidence), "utf8"),
    writeFile(path.join(SEED_DIR, "facts.json"), json(allFacts), "utf8"),
  ]);

  console.info(`Applied South batch 04: ${validated.entities.length} entities (+${EXPECTED.newEntities}), ${mergedEvidence.length} evidence (+${EXPECTED.evidence}), ${allFacts.length} facts (+${EXPECTED.facts}). Unknown status: ${unknownOriginal.length} pre-existing + ${unknownNew.length} new = ${unknownOriginal.length + unknownNew.length}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
