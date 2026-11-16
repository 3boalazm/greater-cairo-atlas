import { readFile, writeFile } from "node:fs/promises";
import { adaptResearchSeedSources, buildDeterministicFactCode } from "../src/lib/atlas/research-seed";
import { escapeCsvCell, loadAndValidateSeedDir, parseCsvRows, validateSeedSources } from "../src/lib/atlas/seed";
import type { FactSeed } from "../src/lib/atlas/schema";

const seed = "data/seed", research = "data/research/east-batch07";
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const read = (p: string) => readFile(p, "utf8");
type RawEvidence = { evidence_ref: string; url_check: string; note?: string; source_type: string; source_url: string };
type RawFact = { entity_code: string; attribute_key: string; value: string; verification_state: string; evidence_ref: string };
function compatible(a: FactSeed, b: FactSeed) { return a.unit === b.unit && a.valid_as_of === b.valid_as_of && a.valid_as_of_precision === b.valid_as_of_precision && a.verification_state === b.verification_state && a.notes === b.notes; }
async function main() {
  const [current, baseCsv, rawCsv, f, e, remap] = await Promise.all([loadAndValidateSeedDir(seed), read(`${seed}/entities.csv`), read(`${research}/entities.csv`), read(`${research}/facts.json`), read(`${research}/evidence.json`), read(`${research}/code_remap.json`)]);
  if (current.entities.length !== 535 || current.facts.length !== 2735 || current.evidence.length !== 764 || current.facts.reduce((n, x) => n + x.evidence_codes.length, 0) !== 3088 || current.entities.filter((x) => x.status === "unknown").length !== 4) throw new Error("Unexpected baseline; refusing to merge");
  if (Object.keys(JSON.parse(remap)).length) throw new Error("Unexpected code remap");
  const issues: Array<{path: string; message: string}> = [];
  const rows = parseCsvRows(rawCsv, issues), header = rows[0]?.cells ?? [];
  const names = ["code", "name_ar", "name_en", "entity_type", "sector", "status", "aliases", "description"];
  if (issues.length || names.some((key) => !header.includes(key))) throw new Error("Invalid research entity headers");
  const entries = rows.slice(1).map((row) => Object.fromEntries(header.map((key, i) => [key, row.cells[i] ?? ""])));
  const codes = entries.map((x) => x.code), priorCodes = new Set(current.entities.map((x) => x.code));
  if (entries.length !== 21 || new Set(codes).size !== 21 || codes.some((c) => !c || priorCodes.has(c)) || entries.some((x) => x.sector !== "EAST")) throw new Error("Entity count or code collision");
  const researchHeaders = ["entity_code", "entity_type", "canonical_name_ar", "canonical_name_en", "aliases", "sector_code", "status", "description"];
  const columns = ["code", "entity_type", "name_ar", "name_en", "aliases", "sector", "status", "description"];
  const adapterCsv = `${researchHeaders.join(",")}\n${entries.map((r) => columns.map((c) => escapeCsvCell(r[c] ?? "")).join(",")).join("\n")}\n`;
  const facts = JSON.parse(f) as RawFact[], evidence = JSON.parse(e) as RawEvidence[];
  if (facts.length !== 66 || evidence.length !== 29 || facts.filter((x) => x.verification_state === "verified").length !== 57 || facts.filter((x) => x.verification_state === "single_source").length !== 9) throw new Error("Unexpected supplied totals or states");
  const refs = new Set(evidence.map((x) => x.evidence_ref)), previousRefs = new Set(current.evidence.map((x) => x.code));
  if (refs.size !== 29 || evidence.some((x) => !/^EV-E7C-\d{3}$/.test(x.evidence_ref) || previousRefs.has(x.evidence_ref) || x.url_check !== "ok")) throw new Error("Invalid evidence refs or URL checks");
  for (const fact of facts) { const source = evidence.find((x) => x.evidence_ref === fact.evidence_ref); if (!source || !codes.includes(fact.entity_code) || (fact.verification_state === "verified" && (source.source_type !== "official" || source.url_check !== "ok" || !source.source_url))) throw new Error(`Invalid fact ${fact.entity_code} ${fact.evidence_ref}`); }
  const folded = evidence.map(({url_check, ...row}) => ({...row, note: `${row.note || ""}${row.note ? " · " : ""}url_check=${url_check}`}));
  const adapted = adaptResearchSeedSources({entitiesCsv: adapterCsv, factsJsonText: f, evidenceJsonText: json(folded), selectedRevision: "east-batch07"});
  if (!adapted.ok || !adapted.bundle || adapted.bundle.entities.length !== 21 || adapted.bundle.facts.length !== 66 || adapted.bundle.evidence.length !== 29) throw new Error(`Adaptation failed: ${JSON.stringify(adapted.report.issues)}`);
  const allFacts = current.facts.map((x) => ({...x, evidence_codes: [...x.evidence_codes]})), factCodes = new Set(allFacts.map((x) => x.code));
  const overlaps: unknown[] = [];
  for (const fact of adapted.bundle.facts) {
    const same = allFacts.filter((x) => x.entity_code === fact.entity_code && x.attribute === fact.attribute && x.value === fact.value), match = same.find((x) => compatible(x, fact));
    if (same.length) overlaps.push({entity: fact.entity_code, attribute: fact.attribute, value: fact.value, action: match ? "attach evidence" : "retain separately"});
    if (match) { match.evidence_codes = [...new Set([...match.evidence_codes, ...fact.evidence_codes])]; continue; }
    let seq = allFacts.filter((x) => x.entity_code === fact.entity_code && x.attribute === fact.attribute).length + 1, code = buildDeterministicFactCode(fact.entity_code, fact.attribute, seq);
    while (factCodes.has(code)) code = buildDeterministicFactCode(fact.entity_code, fact.attribute, ++seq);
    factCodes.add(code); allFacts.push({...fact, code});
  }
  if (overlaps.length) throw new Error(`Unexpected exact overlaps; review: ${JSON.stringify(overlaps)}`);
  const baseRows = parseCsvRows(baseCsv, issues), baseHeader = baseRows[0]?.cells ?? [];
  if (issues.length || baseHeader.length !== names.length || names.some((name) => !baseHeader.includes(name))) throw new Error("Unexpected baseline entity header");
  const resultCsv = `${baseCsv.replace(/\s*$/, "")}\n${entries.map((r) => baseHeader.map((c) => escapeCsvCell(r[c] ?? "")).join(",")).join("\n")}\n`;
  const allEvidence = [...current.evidence, ...adapted.bundle.evidence], result = validateSeedSources({entitiesCsv: resultCsv, factsJsonText: json(allFacts), evidenceJsonText: json(allEvidence)});
  if (result.entities.length !== 556 || result.facts.length !== 2801 || result.evidence.length !== 793 || result.facts.reduce((n, x) => n + x.evidence_codes.length, 0) !== 3154 || result.entities.filter((x) => x.status === "unknown").length !== 4) throw new Error("Unexpected result totals");
  await Promise.all([writeFile(`${seed}/entities.csv`, resultCsv), writeFile(`${seed}/facts.json`, json(allFacts)), writeFile(`${seed}/evidence.json`, json(allEvidence))]);
  console.log("Merged 21 entities, 66 facts, 29 evidence; 0 exact overlaps.");
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
