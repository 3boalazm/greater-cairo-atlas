import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { adaptResearchSeedSources, buildDeterministicFactCode } from "../src/lib/atlas/research-seed";
import { escapeCsvCell, loadAndValidateSeedDir, parseCsvRows, serializeEntitiesCsv, validateSeedSources } from "../src/lib/atlas/seed";
import type { EntitySeed, FactSeed } from "../src/lib/atlas/schema";

const root = process.cwd();
const seedDir = path.join(root, "data/seed");
const research = path.join(root, "data/research/unknowns-batch08");
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
type RawEvidence = { evidence_ref: string; url_check: string; note?: string; source_type: string; source_url: string };
type RawFact = { entity_code: string; attribute_key: string; value: string; unit: string | null; status_as_of: string | null; verification_state: string; evidence_ref: string };
type Change = { entity_code: string; from: string; to: string; basis: string[] };
type AliasFix = { aliases_before: string; aliases_after: string; alias_count: number };
const expected = new Map([["LINE-HELWAN-OLD-RAIL", "partial"], ["STOP-BRT-AL-HARAM", "approved_planned"], ["STOP-BRT-FAISAL", "approved_planned"], ["STOP-BRT-TERSA", "approved_planned"]]);

function researchRow(entity: EntitySeed): string {
  return [entity.code, entity.entity_type, entity.name_ar, entity.name_en, entity.aliases.join("|"), entity.sector, entity.status, entity.description ?? ""].map(escapeCsvCell).join(",");
}
function sameClaim(a: FactSeed, b: FactSeed): boolean {
  return a.unit === b.unit && a.valid_as_of === b.valid_as_of && a.valid_as_of_precision === b.valid_as_of_precision && a.verification_state === b.verification_state && a.notes === b.notes;
}

async function main() {
  const [current, csv, f, e, changesText, rejectedText, aliasesText] = await Promise.all([
    loadAndValidateSeedDir(seedDir), readFile(path.join(seedDir, "entities.csv"), "utf8"), readFile(path.join(research, "facts.json"), "utf8"), readFile(path.join(research, "evidence.json"), "utf8"), readFile(path.join(research, "status_changes.json"), "utf8"), readFile(path.join(research, "status_changes_rejected.json"), "utf8"), readFile(path.join(root, "data/research/alias-fix-batch22/aliases_fix.json"), "utf8"),
  ]);
  if (current.entities.length !== 535 || current.facts.length !== 2685 || current.evidence.length !== 730 || current.facts.reduce((n, x) => n + x.evidence_codes.length, 0) !== 3038 || current.entities.filter((x) => x.status === "unknown").length !== 8) throw new Error("Unexpected baseline; refusing to merge");
  const facts = JSON.parse(f) as RawFact[], evidence = JSON.parse(e) as RawEvidence[], changes = JSON.parse(changesText) as Change[], rejected = JSON.parse(rejectedText) as Change[], aliases = JSON.parse(aliasesText) as Record<string, AliasFix>;
  if (facts.length !== 50 || evidence.length !== 34 || facts.filter((x) => x.verification_state === "verified").length !== 20 || facts.filter((x) => x.verification_state === "single_source").length !== 30) throw new Error("Unexpected supplied fact/evidence totals or states");
  const refs = evidence.map((x) => x.evidence_ref), evMap = new Map(evidence.map((x) => [x.evidence_ref, x]));
  const oldEvidence = new Set(current.evidence.map((x) => x.code));
  if (new Set(refs).size !== 34 || refs.some((ref) => !/^EV-V8-\d{3}$/.test(ref) || oldEvidence.has(ref))) throw new Error("Evidence identifier collision");
  for (const fact of facts) {
    const source = evMap.get(fact.evidence_ref);
    if (!source || (fact.verification_state === "verified" && !(source.source_type === "official" && source.url_check === "ok" && source.source_url))) throw new Error(`Invalid evidence for ${fact.evidence_ref}`);
  }
  if (changes.length !== 4 || new Set(changes.map((x) => x.entity_code)).size !== 4 || changes.some((x) => x.from !== "unknown" || expected.get(x.entity_code) !== x.to)) throw new Error("Unexpected status changes");
  for (const change of changes) {
    const entity = current.entities.find((x) => x.code === change.entity_code);
    if (!entity || entity.status !== change.from || !change.basis.every((ref) => evMap.has(ref)) || !change.basis.some((ref) => { const source = evMap.get(ref); return source?.source_type === "official" && source.url_check === "ok" && !!source.source_url; })) throw new Error(`Invalid baseline status or official basis for ${change.entity_code}`);
  }
  if (rejected.length !== 1 || rejected[0]?.entity_code !== "ROAD-CAIRO-ASSIUT-AGRI" || current.entities.find((x) => x.code === rejected[0]?.entity_code)?.status !== "unknown") throw new Error("Unexpected rejected status baseline");
  const issues: Array<{ path: string; message: string }> = [];
  const rows = parseCsvRows(csv, issues), header = rows[0]?.cells ?? [];
  if (issues.length || !header.includes("aliases") || !header.includes("code")) throw new Error(`Invalid seed CSV ${JSON.stringify(issues)}`);
  const rawRows = new Map(rows.slice(1).map((row) => [row.cells[header.indexOf("code")], row.cells[header.indexOf("aliases")]]));
  if (Object.keys(aliases).length !== 23) throw new Error("Unexpected alias repair count");
  for (const [code, fix] of Object.entries(aliases)) {
    const original = rawRows.get(code), entity = current.entities.find((item) => item.code === code);
    const split = fix.aliases_before.split(/[;؛]/).map((value) => value.trim()).filter(Boolean);
    const deduped = [...new Set(split)];
    if (!entity || entity.sector !== "NORTH" || original !== fix.aliases_before || entity.aliases.length !== 1 || deduped.join("|") !== fix.aliases_after || deduped.length !== fix.alias_count || fix.aliases_after.includes(";")) throw new Error(`Alias baseline or repair mismatch for ${code}`);
  }
  if (Object.values(aliases).reduce((n, x) => n + x.alias_count, 0) !== 49) throw new Error("Unexpected repaired alias total");
  const referenced = [...new Set(facts.map((x) => x.entity_code))].map((code) => {
    const entity = current.entities.find((x) => x.code === code);
    if (!entity) throw new Error(`Unknown entity ${code}`);
    return researchRow(entity);
  });
  const entitiesCsv = `entity_code,entity_type,canonical_name_ar,canonical_name_en,aliases,sector_code,status,description\n${referenced.join("\n")}\n`;
  const folded = evidence.map(({ url_check, ...row }) => ({ ...row, note: `${row.note || ""}${row.note ? " · " : ""}url_check=${url_check}` }));
  const adapted = adaptResearchSeedSources({ entitiesCsv, factsJsonText: f, evidenceJsonText: json(folded), selectedRevision: "unknowns-batch08" });
  if (!adapted.ok || !adapted.bundle || adapted.bundle.facts.length !== 50 || adapted.bundle.evidence.length !== 34) throw new Error(`Adaptation failed: ${JSON.stringify(adapted.report.issues)}`);
  const allFacts = current.facts.map((x) => ({ ...x, evidence_codes: [...x.evidence_codes] }));
  const existingCodes = new Set(allFacts.map((x) => x.code));
  const overlaps: Array<{ entity_code: string; attribute: string; value: string; prior: string[]; action: string }> = [];
  for (const fact of adapted.bundle.facts) {
    const same = allFacts.filter((x) => x.entity_code === fact.entity_code && x.attribute === fact.attribute && x.value === fact.value);
    const compatible = same.find((x) => sameClaim(x, fact));
    if (same.length) overlaps.push({ entity_code: fact.entity_code, attribute: fact.attribute, value: fact.value, prior: same.map((x) => x.code), action: compatible ? "attach_evidence" : "retain_separate_fact" });
    if (compatible) { compatible.evidence_codes = [...new Set([...compatible.evidence_codes, ...fact.evidence_codes])]; continue; }
    let sequence = allFacts.filter((x) => x.entity_code === fact.entity_code && x.attribute === fact.attribute).length + 1;
    let code = buildDeterministicFactCode(fact.entity_code, fact.attribute, sequence);
    while (existingCodes.has(code)) code = buildDeterministicFactCode(fact.entity_code, fact.attribute, ++sequence);
    existingCodes.add(code); allFacts.push({ ...fact, code });
  }
  // If unexpected overlaps exist, refuse to write so they are reviewed and reported explicitly.
  if (overlaps.length) throw new Error(`Unexpected exact-value overlaps; review before proceeding: ${JSON.stringify(overlaps)}`);
  const entities = current.entities.map((entity) => {
    const change = changes.find((x) => x.entity_code === entity.code), fix = aliases[entity.code];
    return { ...entity, status: (change?.to ?? entity.status) as EntitySeed["status"], aliases: fix ? fix.aliases_after.split("|") : entity.aliases };
  });
  const allEvidence = [...current.evidence, ...adapted.bundle.evidence];
  const validated = validateSeedSources({ entitiesCsv: serializeEntitiesCsv(entities), factsJsonText: json(allFacts), evidenceJsonText: json(allEvidence) });
  if (validated.entities.length !== 535 || validated.facts.length !== 2735 || validated.evidence.length !== 764 || validated.facts.reduce((n, x) => n + x.evidence_codes.length, 0) !== 3088 || validated.entities.filter((x) => x.status === "unknown").length !== 4) throw new Error("Unexpected validated totals");
  await Promise.all([writeFile(path.join(seedDir, "entities.csv"), serializeEntitiesCsv(entities)), writeFile(path.join(seedDir, "facts.json"), json(allFacts)), writeFile(path.join(seedDir, "evidence.json"), json(allEvidence))]);
  console.info("Merged 535 entities, 2735 facts, 764 evidence, 3088 links, 4 unknown; 23→49 repaired aliases; 0 overlaps.");
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
