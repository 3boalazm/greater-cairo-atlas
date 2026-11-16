import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { adaptResearchSeedSources, buildDeterministicFactCode } from "../src/lib/atlas/research-seed";
import { escapeCsvCell, loadAndValidateSeedDir, parseCsvRows, serializeEntitiesCsv, validateSeedSources } from "../src/lib/atlas/seed";
import type { EntitySeed, EvidenceSeed, FactSeed } from "../src/lib/atlas/schema";
import type { ValidationIssueDetail } from "../src/lib/errors";

const root = process.cwd();
const seedDir = path.join(root, "data/seed");
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
type RawEvidence = { evidence_ref: string; url_check: string; note?: string; source_type: string; source_url: string };
type RawFact = { entity_code: string; attribute_key: string; value: string; unit: string; status_as_of: string; verification_state: string; evidence_ref: string };
type Batch = { name: string; sector: string; entities: number; facts: number; evidence: number; prefix: RegExp };
const batches: Batch[] = [
  { name: "west-batch07", sector: "WEST", entities: 27, facts: 138, evidence: 68, prefix: /^EV-W7-\d{3}$/ },
  { name: "north-batch07", sector: "NORTH", entities: 25, facts: 121, evidence: 82, prefix: /^EV-N7-\d{3}$/ },
];
const researchHeader = "entity_code,entity_type,canonical_name_ar,canonical_name_en,aliases,sector_code,status,description";
const csvColumns = ["code", "entity_type", "name_ar", "name_en", "aliases", "sector", "status", "description"];

function researchEntities(text: string, batch: Batch): { rows: string[]; codes: string[] } {
  const issues: ValidationIssueDetail[] = [];
  const rows = parseCsvRows(text, issues);
  if (issues.length) throw new Error(`Invalid ${batch.name} CSV: ${JSON.stringify(issues)}`);
  const header = rows[0]?.cells ?? [];
  if (header.length !== csvColumns.length || new Set(header).size !== header.length || csvColumns.some((key) => !header.includes(key))) throw new Error(`Unexpected ${batch.name} headers`);
  const output: string[] = [], codes: string[] = [];
  for (const row of rows.slice(1)) {
    if (row.cells.length !== header.length) throw new Error(`Invalid row at ${batch.name}:${row.lineNumber}`);
    const fields = Object.fromEntries(header.map((key, i) => [key, row.cells[i] ?? ""]));
    if (fields.sector !== batch.sector || !fields.code) throw new Error(`Invalid sector/code at ${batch.name}:${row.lineNumber}`);
    output.push(csvColumns.map((key) => escapeCsvCell(fields[key]!)).join(","));
    codes.push(fields.code);
  }
  if (codes.length !== batch.entities || new Set(codes).size !== codes.length) throw new Error(`Unexpected ${batch.name} entity count`);
  return { rows: output, codes };
}
function researchRow(entity: EntitySeed): string {
  return [entity.code, entity.entity_type, entity.name_ar, entity.name_en, entity.aliases.join("|"), entity.sector, entity.status, entity.description ?? ""].map(escapeCsvCell).join(",");
}
function sameClaim(a: FactSeed, b: FactSeed): boolean {
  // A fact owns its own date, unit, notes and verification state. A shared
  // evidence link cannot preserve two different values for those properties.
  return a.unit === b.unit && a.valid_as_of === b.valid_as_of && a.valid_as_of_precision === b.valid_as_of_precision && a.verification_state === b.verification_state && a.notes === b.notes;
}

async function main() {
  const current = await loadAndValidateSeedDir(seedDir);
  if (current.entities.length !== 483 || current.facts.length !== 2426 || current.evidence.length !== 580 || current.facts.reduce((sum, f) => sum + f.evidence_codes.length, 0) !== 2779) throw new Error("Unexpected baseline; refusing to merge");
  const inputs = await Promise.all(batches.map(async (batch) => {
    const directory = path.join(root, "data/research", batch.name);
    const [csv, factsText, evidenceText] = await Promise.all([readFile(path.join(directory, "entities.csv"), "utf8"), readFile(path.join(directory, "facts.json"), "utf8"), readFile(path.join(directory, "evidence.json"), "utf8")]);
    return { batch, entities: researchEntities(csv, batch), factsText, evidenceText };
  }));
  const allNewCodes = inputs.flatMap((input) => input.entities.codes);
  const oldCodes = new Set(current.entities.map((entity) => entity.code));
  if (new Set(allNewCodes).size !== allNewCodes.length || allNewCodes.some((code) => oldCodes.has(code))) throw new Error("New entity code collision within, across or against the seed");
  const newSet = new Set(allNewCodes);
  const newRows = inputs.flatMap((input) => input.entities.rows);
  const existingFacts = new Set(current.facts.map((fact) => fact.code));
  const existingEvidence = new Set(current.evidence.map((evidence) => evidence.code));
  const allFacts: FactSeed[] = current.facts.map((fact) => ({ ...fact, evidence_codes: [...fact.evidence_codes] }));
  const allEvidence: EvidenceSeed[] = [...current.evidence];
  const overlaps: Array<{ batch: string; entity_code: string; attribute: string; value: string; incoming_evidence: string[]; prior_fact_codes: string[]; action: string; reason: string }> = [];
  let newEntities: EntitySeed[] = [];
  let attached = 0;
  for (const input of inputs) {
    const { batch } = input;
    const facts = JSON.parse(input.factsText) as RawFact[];
    const evidence = JSON.parse(input.evidenceText) as RawEvidence[];
    const refs = evidence.map((row) => row.evidence_ref);
    if (facts.length !== batch.facts || evidence.length !== batch.evidence || new Set(refs).size !== refs.length || refs.some((ref) => !batch.prefix.test(ref) || existingEvidence.has(ref))) throw new Error(`Unexpected ${batch.name} counts or evidence collision`);
    const sources = new Map(evidence.map((row) => [row.evidence_ref, row]));
    for (const fact of facts) {
      const source = sources.get(fact.evidence_ref);
      if (!source || (fact.verification_state === "verified" && !(source.source_type === "official" && source.url_check === "ok" && source.source_url))) throw new Error(`Missing or invalid evidence for ${fact.evidence_ref}`);
    }
    const refsToOld = [...new Set(facts.map((fact) => fact.entity_code).filter((code) => !newSet.has(code)))];
    const referenced = refsToOld.map((code) => {
      const entity = current.entities.find((item) => item.code === code);
      if (!entity) throw new Error(`Unknown entity ${code} in ${batch.name}`);
      return researchRow(entity);
    });
    // Both batches' new entities are known before either fact batch is adapted.
    const csv = [researchHeader, ...newRows, ...referenced].join("\n") + "\n";
    const folded = evidence.map(({ url_check, ...row }) => ({
      ...row,
      // "data" is not a canonical evidence enum; its non-official dataset
      // equivalent is used while retaining the supplied source type in notes.
      source_type: row.source_type === "data" ? "dataset" : row.source_type,
      note: [row.note || "", `url_check=${url_check}`, row.source_type === "data" ? "source_type_original=data" : ""].filter(Boolean).join(" · "),
    }));
    // Canonical attributes must start with a letter (also enforced in Postgres).
    // Preserve the exact original key in notes instead of changing the raw source.
    const adaptedFacts = facts.map((fact) => /^6october_separator_(length|width)$/.test(fact.attribute_key)
      ? { ...fact, attribute_key: `attr_${fact.attribute_key}`, note: `source_attribute_key=${fact.attribute_key}` }
      : fact);
    const adapted = adaptResearchSeedSources({ entitiesCsv: csv, factsJsonText: json(adaptedFacts), evidenceJsonText: json(folded), selectedRevision: batch.name });
    if (!adapted.ok || !adapted.bundle) throw new Error(`${batch.name} adaptation failed: ${JSON.stringify(adapted.report.issues)}`);
    if (adapted.bundle.facts.length !== facts.length || adapted.bundle.evidence.length !== evidence.length) throw new Error(`Adaptation lost rows from ${batch.name}`);
    if (!newEntities.length) newEntities = adapted.bundle.entities.filter((entity) => newSet.has(entity.code));
    for (const fact of adapted.bundle.facts) {
      const sameValue = allFacts.filter((old) => old.entity_code === fact.entity_code && old.attribute === fact.attribute && old.value === fact.value);
      const compatible = sameValue.find((old) => sameClaim(old, fact));
      if (sameValue.length) {
        overlaps.push({ batch: batch.name, entity_code: fact.entity_code, attribute: fact.attribute, value: fact.value, incoming_evidence: fact.evidence_codes, prior_fact_codes: sameValue.map((old) => old.code), action: compatible ? "attach_evidence" : "retain_separate_fact", reason: compatible ? "unit, date, precision, state and notes match" : "unit, date, precision, state or notes differ; merging would lose claim metadata" });
      }
      if (compatible) {
        compatible.evidence_codes = [...new Set([...compatible.evidence_codes, ...fact.evidence_codes])];
        attached++;
        continue;
      }
      let sequence = allFacts.filter((old) => old.entity_code === fact.entity_code && old.attribute === fact.attribute).length + 1;
      let code = buildDeterministicFactCode(fact.entity_code, fact.attribute, sequence);
      while (existingFacts.has(code)) code = buildDeterministicFactCode(fact.entity_code, fact.attribute, ++sequence);
      existingFacts.add(code);
      allFacts.push({ ...fact, code });
    }
    allEvidence.push(...adapted.bundle.evidence);
    refs.forEach((ref) => existingEvidence.add(ref));
  }
  if (newEntities.length !== 52 || overlaps.length !== 7 || attached !== 0) throw new Error(`Unexpected new entities or overlap decisions: ${newEntities.length}, ${overlaps.length}, ${attached}`);
  const entities = [...current.entities, ...newEntities];
  const validated = validateSeedSources({ entitiesCsv: serializeEntitiesCsv(entities), evidenceJsonText: json(allEvidence), factsJsonText: json(allFacts) });
  const links = validated.facts.reduce((sum, fact) => sum + fact.evidence_codes.length, 0);
  if (validated.entities.length !== 535 || validated.facts.length !== 2685 || validated.evidence.length !== 730 || links !== 3038) throw new Error(`Unexpected output counts: ${validated.entities.length}, ${validated.facts.length}, ${validated.evidence.length}, ${links}`);
  await Promise.all([
    writeFile(path.join(seedDir, "entities.csv"), serializeEntitiesCsv(entities)),
    writeFile(path.join(seedDir, "facts.json"), json(allFacts)),
    writeFile(path.join(seedDir, "evidence.json"), json(allEvidence)),
    writeFile(path.join(root, "data/research/batch22-overlaps.json"), json({ definition: "exact entity_code, attribute and value", baseline_overlap_rows: 6, cross_batch_overlap_rows: 1, attached, overlaps })),
  ]);
  console.info(`Merged ${entities.length} entities, ${allFacts.length} facts, ${allEvidence.length} evidence, ${links} links; ${overlaps.length} overlaps, ${attached} attached.`);
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
