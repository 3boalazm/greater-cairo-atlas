import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { loadAndValidateSeedDir } from "../src/lib/atlas/seed";
import { deriveEntityRelations, type OsmRouteRelation } from "../src/lib/atlas/entity-relations";

async function main() {
  const root = process.cwd();
  const bundle = await loadAndValidateSeedDir(path.join(root, "data/seed"));
  const osmPath = path.join(root, "data/raw/cairo-osm-rail-2026-11-14.json.gz");
  const osmData = JSON.parse(gunzipSync(await readFile(osmPath)).toString("utf8")) as { elements: OsmRouteRelation[] };
  const result = deriveEntityRelations(bundle.entities, bundle.facts, osmData.elements.filter((element) => element.type === "relation"));
  await writeFile(path.join(root, "data/seed/relations.json"), `${JSON.stringify(result.relations, null, 2)}\n`, "utf8");
  const report = {
    derived_at: new Date().toISOString(),
    relations_count: result.relations.length,
    by_predicate: Object.fromEntries([...new Set(result.relations.map((relation) => relation.predicate))].sort().map((predicate) =>
      [predicate, result.relations.filter((relation) => relation.predicate === predicate).length])),
    without_evidence_count: result.relations.filter((relation) => !relation.evidence_ref).length,
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
