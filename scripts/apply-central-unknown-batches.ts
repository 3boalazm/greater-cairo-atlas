import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { adaptResearchSeedSources, buildDeterministicFactCode } from "../src/lib/atlas/research-seed";
import { escapeCsvCell, loadAndValidateSeedDir, parseCsvRows, serializeEntitiesCsv, validateSeedSources } from "../src/lib/atlas/seed";
import type { EntitySeed, EvidenceSeed, FactSeed } from "../src/lib/atlas/schema";
import type { ValidationIssueDetail } from "../src/lib/errors";

const root = process.cwd();
const seedDir = path.join(root, "data/seed");
const centralDir = path.join(root, "data/research/central-batch05");
const unknownDir = path.join(root, "data/research/unknowns-batch06");
const approved = new Map([
  ["BRIDGE-RING-NORTH-WARRAQ", "operational"], ["CITY-MOSTAKBAL", "partial"],
  ["DIST-HADAEK-ASHGAR", "operational"], ["DIST-MANSOURIYA", "operational"],
  ["PROJ-ADDED-LANDS-REGULARIZATION", "partial"], ["ROAD-DAHSHUR-LINK", "operational"],
  ["ROAD-MARYUTEYA", "partial"], ["ROAD-MBZ-NORTH", "operational"], ["ROAD-WESTERN-DESERT", "operational"],
]);
const protectedRemaps = new Set(["PROJ-FUSTAT-HILLS", "LANDMARK-EIN-EL-SIRA", "PROJ-MAGRA-EL-OYOUN", "TRANSIT-METRO-L4", "DIST-TAHRIR"]);
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
type RawEvidence = { evidence_ref: string; url_check: string; note?: string; source_type: string; source_url: string };
type RawFact = { entity_code: string; attribute_key: string; value: string; unit: string; status_as_of: string; verification_state: string; evidence_ref: string };
type StatusChange = { entity_code: string; from: string; to: string; basis: string[] };

function centralResearchCsv(text: string): { csv: string; codes: string[] } {
  const issues: ValidationIssueDetail[] = [];
  const rows = parseCsvRows(text, issues);
  if (issues.length) throw new Error(`Invalid batch CSV: ${JSON.stringify(issues)}`);
  const header = rows[0]?.cells ?? [];
  const required = ["code", "name_ar", "name_en", "entity_type", "sector", "status", "aliases", "description"];
  if (new Set(header).size !== header.length || header.length !== required.length || required.some((field) => !header.includes(field))) throw new Error("Invalid central entity headers");
  const map = ["code", "entity_type", "name_ar", "name_en", "aliases", "sector", "status", "description"];
  const output = ["entity_code,entity_type,canonical_name_ar,canonical_name_en,aliases,sector_code,status,description"];
  const codes: string[] = [];
  for (const row of rows.slice(1)) {
    if (row.cells.length !== header.length) throw new Error(`Invalid entity row at line ${row.lineNumber}`);
    const byName = Object.fromEntries(header.map((name, index) => [name, row.cells[index] ?? ""]));
    if (byName.sector !== "CENTRAL") throw new Error(`Not central: ${byName.code}`);
    codes.push(byName.code!);
    output.push(map.map((key) => escapeCsvCell(byName[key]!)).join(","));
  }
  if (codes.length !== 35 || new Set(codes).size !== 35) throw new Error("Expected 35 unique Central entities");
  return { csv: output.join("\n") + "\n", codes };
}

function researchRow(entity: EntitySeed): string {
  return [entity.code, entity.entity_type, entity.name_ar, entity.name_en, entity.aliases.join("|"), entity.sector, entity.status, entity.description ?? ""].map(escapeCsvCell).join(",");
}

async function main() {
  const [current, centralCsv, cf, ce, uf, ue, changesText] = await Promise.all([
    loadAndValidateSeedDir(seedDir), readFile(path.join(centralDir, "entities.csv"), "utf8"),
    readFile(path.join(centralDir, "facts.json"), "utf8"), readFile(path.join(centralDir, "evidence.json"), "utf8"),
    readFile(path.join(unknownDir, "facts.json"), "utf8"), readFile(path.join(unknownDir, "evidence.json"), "utf8"),
    readFile(path.join(unknownDir, "status_changes.json"), "utf8"),
  ]);
  if (current.entities.length !== 448 || current.entities.filter((e) => e.status === "unknown").length !== 13) throw new Error("Unexpected baseline; refusing to merge");
  const { csv, codes } = centralResearchCsv(centralCsv);
  const currentCodes = new Set(current.entities.map((row) => row.code));
  if (codes.some((code) => currentCodes.has(code))) throw new Error("Central entity already exists in seed");
  const changes = JSON.parse(changesText) as StatusChange[];
  if (changes.length !== 9 || new Set(changes.map((c) => c.entity_code)).size !== 9 || changes.some((c) => c.from !== "unknown" || approved.get(c.entity_code) !== c.to || protectedRemaps.has(c.entity_code))) throw new Error("Unexpected status change list");
  const unknownEvidence = JSON.parse(ue) as RawEvidence[];
  const evidenceByCode = new Map(unknownEvidence.map((item) => [item.evidence_ref, item]));
  for (const change of changes) {
    const entity = current.entities.find((e) => e.code === change.entity_code);
    if (!entity || entity.status !== "unknown" || !change.basis.every((ref) => evidenceByCode.has(ref)) || !change.basis.some((ref) => { const e = evidenceByCode.get(ref); return e?.source_type === "official" && e.url_check === "ok" && !!e.source_url; })) throw new Error(`Invalid status evidence or baseline for ${change.entity_code}`);
  }
  const newCodeSet = new Set(codes);
  const existingEvidence = new Set(current.evidence.map((item) => item.code));
  const existingFactCodes = new Set(current.facts.map((item) => item.code));
  const facts: FactSeed[] = [];
  const evidence: EvidenceSeed[] = [];
  let newEntities: EntitySeed[] = [];
  for (const batch of [
    { name: "central-batch05", factsText: cf, evidenceText: ce, expectedFacts: 116, expectedEvidence: 65, prefix: /^EV-C5-\d{3}$/ },
    { name: "unknowns-batch06", factsText: uf, evidenceText: ue, expectedFacts: 58, expectedEvidence: 67, prefix: /^EV-U6-\d{3}$/ },
  ]) {
    const rawFacts = JSON.parse(batch.factsText) as RawFact[];
    const rawEvidence = JSON.parse(batch.evidenceText) as RawEvidence[];
    const refs = rawEvidence.map((e) => e.evidence_ref);
    if (rawFacts.length !== batch.expectedFacts || refs.length !== batch.expectedEvidence || new Set(refs).size !== refs.length || refs.some((ref) => !batch.prefix.test(ref) || existingEvidence.has(ref))) throw new Error(`Unexpected ${batch.name} counts or evidence collision`);
    const batchEvidence = new Map(rawEvidence.map((e) => [e.evidence_ref, e]));
    for (const fact of rawFacts) {
      const source = batchEvidence.get(fact.evidence_ref);
      if (!source || (fact.verification_state === "verified" && !(source.source_type === "official" && source.url_check === "ok" && source.source_url))) throw new Error(`Invalid verified source ${fact.evidence_ref}`);
    }
    const refCodes = [...new Set(rawFacts.map((f) => f.entity_code).filter((code) => !newCodeSet.has(code)))];
    const referenced = refCodes.map((code) => { const entity = current.entities.find((item) => item.code === code); if (!entity) throw new Error(`Unknown entity ${code}`); return researchRow(entity); });
    const inputCsv = batch.name === "central-batch05" ? `${csv.trimEnd()}\n${referenced.join("\n")}\n` : `entity_code,entity_type,canonical_name_ar,canonical_name_en,aliases,sector_code,status,description\n${referenced.join("\n")}\n`;
    const folded = rawEvidence.map(({ url_check, ...row }) => ({ ...row, note: `${row.note || ""}${row.note ? " · " : ""}url_check=${url_check}` }));
    const adapted = adaptResearchSeedSources({ entitiesCsv: inputCsv, factsJsonText: batch.factsText, evidenceJsonText: json(folded), selectedRevision: batch.name });
    if (!adapted.ok || !adapted.bundle) throw new Error(`${batch.name} validation failed: ${JSON.stringify(adapted.report.issues)}`);
    if (adapted.bundle.facts.length !== rawFacts.length || adapted.bundle.evidence.length !== rawEvidence.length) throw new Error(`Lost data in ${batch.name}`);
    if (batch.name === "central-batch05") newEntities = adapted.bundle.entities.filter((e) => newCodeSet.has(e.code));
    for (const fact of adapted.bundle.facts) {
      let sequence = current.facts.filter((old) => old.entity_code === fact.entity_code && old.attribute === fact.attribute).length + 1;
      let code = buildDeterministicFactCode(fact.entity_code, fact.attribute, sequence);
      while (existingFactCodes.has(code)) code = buildDeterministicFactCode(fact.entity_code, fact.attribute, ++sequence);
      existingFactCodes.add(code);
      facts.push({ ...fact, code });
    }
    evidence.push(...adapted.bundle.evidence);
    refs.forEach((ref) => existingEvidence.add(ref));
  }
  if (newEntities.length !== 35) throw new Error("Unexpected new entity count");
  const entities = [...current.entities.map((entity) => {
    const change = changes.find((row) => row.entity_code === entity.code);
    return change ? { ...entity, status: change.to as EntitySeed["status"] } : entity;
  }), ...newEntities];
  const allFacts = [...current.facts, ...facts];
  const allEvidence = [...current.evidence, ...evidence];
  const validated = validateSeedSources({ entitiesCsv: serializeEntitiesCsv(entities), evidenceJsonText: json(allEvidence), factsJsonText: json(allFacts) });
  if (validated.entities.length !== 483 || validated.entities.filter((e) => currentCodes.has(e.code) && e.status === "unknown").length !== 4 || validated.entities.filter((e) => e.status === "unknown").length !== 5) throw new Error("Unexpected entity or unknown count");
  await Promise.all([
    writeFile(path.join(seedDir, "entities.csv"), serializeEntitiesCsv(entities)),
    writeFile(path.join(seedDir, "facts.json"), json(allFacts)),
    writeFile(path.join(seedDir, "evidence.json"), json(allEvidence)),
  ]);
  console.info(`Merged: ${entities.length} entities, ${allFacts.length} facts, ${allEvidence.length} evidence; 4 pre-existing unknowns and 1 new unknown.`);
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
