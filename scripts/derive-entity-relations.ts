import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { loadAndValidateSeedDir } from "../src/lib/atlas/seed";
import { deriveEntityRelations, deriveGovernorateRelations, type CodabGovernorateRelation, type OsmRouteRelation } from "../src/lib/atlas/entity-relations";

async function main() {
  const root = process.cwd();
  const bundle = await loadAndValidateSeedDir(path.join(root, "data/seed"));
  const osmPath = path.join(root, "data/raw/cairo-osm-rail-2026-11-14.json.gz");
  const osmData = JSON.parse(gunzipSync(await readFile(osmPath)).toString("utf8")) as { elements: OsmRouteRelation[] };
  const result = deriveEntityRelations(bundle.entities, bundle.facts, osmData.elements.filter((element) => element.type === "relation"));

  // BATCH 12.4 — governorate parentage derived from the CAPMAS adm1 codes already recorded on each
  // entity's boundary units. Nothing is guessed: only entities whose boundary file has one governorate
  // get a link, and only to governorate entities that exist in the seed.
  const codabRelations = JSON.parse(await readFile(path.join(root, "data/features/codab-relations.json"), "utf8")) as CodabGovernorateRelation[];
  const governorateResult = deriveGovernorateRelations(codabRelations, bundle.entities);
  const seen = new Set(result.relations.map((relation) => `${relation.subject_code}\u0000${relation.predicate}\u0000${relation.object_code}`));
  const merged = [...result.relations];
  for (const relation of governorateResult.relations) {
    const key = `${relation.subject_code}\u0000${relation.predicate}\u0000${relation.object_code}`;
    if (!seen.has(key)) { merged.push(relation); seen.add(key); }
  }
  merged.sort((a, b) => a.subject_code.localeCompare(b.subject_code) || a.predicate.localeCompare(b.predicate) || a.object_code.localeCompare(b.object_code));

  /**
   * BATCH 12.4 — every relation must be traceable to a fact, so the governorate derivation also emits
   * the supporting `located_in` fact per entity, citing the same CAPMAS evidence row. Existing facts
   * are never modified: a fact is only added when the entity does not already carry it.
   */
  const factsPath = path.join(root, "data/seed/facts.json");
  const existingFacts = JSON.parse(await readFile(factsPath, "utf8")) as typeof bundle.facts;
  const factKeys = new Set(existingFacts.map((fact) => `${fact.entity_code}\u0000${fact.attribute}\u0000${fact.value}`));
  const factsAdded: typeof bundle.facts = [];
  for (const relation of governorateResult.relations) {
    const key = `${relation.subject_code}\u0000${relation.predicate}\u0000${relation.object_code}`;
    if (factKeys.has(key)) continue;
    factKeys.add(key);
    factsAdded.push({
      code: `F-${relation.subject_code}-LOCATED-IN-${relation.object_code}`,
      entity_code: relation.subject_code,
      attribute: "located_in",
      value: relation.object_code,
      unit: null,
      valid_as_of: null,
      valid_as_of_precision: "day",
      verification_state: "candidate",
      evidence_codes: [relation.evidence_ref!],
      notes: "Derived from the published CAPMAS COD-AB adm1 pcode of this entity's own boundary units; no geometry was used.",
    });
  }
  if (factsAdded.length > 0) {
    const mergedFacts = [...existingFacts, ...factsAdded];
    mergedFacts.sort((a, b) => a.code.localeCompare(b.code));
    await writeFile(factsPath, `${JSON.stringify(mergedFacts, null, 2)}\n`, "utf8");
  }

  await writeFile(path.join(root, "data/seed/relations.json"), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  const report = {
    derived_at: new Date().toISOString(),
    relations_count: merged.length,
    by_predicate: Object.fromEntries([...new Set(merged.map((relation) => relation.predicate))].sort().map((predicate) =>
      [predicate, merged.filter((relation) => relation.predicate === predicate).length])),
    without_evidence_count: merged.filter((relation) => !relation.evidence_ref).length,
    governorate_relations_derived: governorateResult.relations.length,
    governorate_relations_unresolved: governorateResult.unresolved,
    governorate_supporting_facts_added: factsAdded.length,
    osm_route_relations_checked: result.osmRouteRelationsChecked,
    osm_route_relations_matched_to_fact_backed_lines: result.osmRouteRelationsMatched,
    osm_route_relation_matched_ids: result.osmRouteRelationMatchedIds,
    osm_route_relations_unmatched_count: result.osmRouteRelationsUnmatched.length,
    osm_route_relations_unmatched: result.osmRouteRelationsUnmatched,
    relation_ordinals_filled_from_osm_route_order: result.osmOrdinalsAdded,
    unresolved_count: result.unresolved.length,
    unresolved: result.unresolved,
  };
  const reportPath = path.join(root, "data/research/entity-relations/derivation-report.json");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.info(JSON.stringify({ relations_count: report.relations_count, by_predicate: report.by_predicate,
    without_evidence_count: report.without_evidence_count, osm_route_relations_checked: report.osm_route_relations_checked,
    osm_route_relations_matched_to_fact_backed_lines: report.osm_route_relations_matched_to_fact_backed_lines,
    osm_route_relations_unmatched_count: report.osm_route_relations_unmatched_count,
    relation_ordinals_filled_from_osm_route_order: report.relation_ordinals_filled_from_osm_route_order,
    unresolved_count: report.unresolved_count }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
