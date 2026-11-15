import type { AtlasFeature } from "@/components/atlas/atlas-client";
export interface GeometryAlternative { feature_code: string; source_label: string; retrieval_date: string; }

/** Flag source-backed line and area alternatives only when distinct source geometries actually disagree. */
export function findGeometryAlternatives(features: readonly AtlasFeature[]): Map<string, GeometryAlternative[]> {
  const grouped = new Map<string, Array<{ feature: AtlasFeature; sourceType: string; sourceId: number; geometryKey: string }>>();
  for (const feature of features) {
    const geometryType = feature.geometry && typeof feature.geometry === "object" && "type" in feature.geometry ? String(feature.geometry.type) : "";
    const isRoute = feature.properties.type === "transit_line" && geometryType.includes("Line");
    const isBoundary = ["Polygon", "MultiPolygon"].includes(geometryType) && ["city", "district", "neighborhood", "authority"].includes(feature.properties.type);
    if (!isRoute && !isBoundary) continue;
    const rawSources = feature.properties.source_ids;
    const sources = Array.isArray(rawSources) ? rawSources : [rawSources];
    const source = sources.find((item): item is { osm_type: string; osm_id: number } => Boolean(item && typeof item === "object" && "osm_type" in item && "osm_id" in item));
    if (!source || typeof source.osm_id !== "number") continue;
    const sourceType = String(source.osm_type);
    if (isRoute && sourceType !== "relation") continue;
    if (isBoundary && !["way", "relation"].includes(sourceType)) continue;
    const entries = grouped.get(feature.properties.entity_code) ?? [];
    entries.push({ feature, sourceType, sourceId: source.osm_id, geometryKey: JSON.stringify(feature.geometry) });
    grouped.set(feature.properties.entity_code, entries);
  }
  const result = new Map<string, GeometryAlternative[]>();
  for (const [code, entries] of grouped) {
    const bySource = new Map(entries.map((entry) => [`${entry.sourceType}:${entry.sourceId}`, entry]));
    const alternatives = [...bySource.values()];
    if (alternatives.length < 2 || new Set(alternatives.map((entry) => entry.geometryKey)).size < 2) continue;
    result.set(code, alternatives.map(({ feature, sourceType, sourceId }) => ({
      feature_code: feature.id,
      source_label: `OpenStreetMap ${sourceType} ${sourceId}`,
      retrieval_date: feature.properties.retrieval_date,
    })));
  }
  return result;
}
