import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";
import { transitModesForEntityCode, isTransitInterchangeEntityCode, type TransitMode } from "@/lib/atlas/transit-modes";
import { stationDisplayName } from "@/lib/atlas/labels";
import type { AtlasFeatureCollection } from "@/components/atlas/atlas-client";

/** Complete checked-in snapshot, used only as a fallback and to prepare compact conflict metadata. */
export async function getStaticMapFeatures(): Promise<AtlasFeatureCollection> {
  const dataset = await getStaticAtlasDataset();
  const entityByCode = new Map(dataset.entities.map((entity) => [entity.code, entity]));
  return {
    type: "FeatureCollection",
    metadata: { data_license: "© Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0", geometry_license: "© OpenStreetMap contributors, ODbL 1.0", contact: "01092500454 · 3boalazm@gmail.com" },
    features: dataset.features.flatMap((feature) => {
      const entity = entityByCode.get(feature.entity_code);
      if (!entity) return [];
      const properties = (feature.properties?.properties ?? {}) as Record<string, unknown>;
      const lineCodes = Array.isArray(properties.matched_line_codes)
        ? [...new Set(properties.matched_line_codes.filter((item): item is string => typeof item === "string"))]
        : [...new Set(dataset.facts.filter((fact) => fact.entity_code === entity.code && ["line_membership", "served_by"].includes(fact.attribute) && fact.verification_state !== "superseded").flatMap((fact) => fact.value.match(/TRANSIT-[A-Z0-9-]+/g) ?? []))];
      const inferredModes = transitModesForEntityCode(entity.code, lineCodes);
      const isStation = entity.entity_type === "transit_stop" || entity.entity_type === "rail_station";
      const modes: TransitMode[] = inferredModes.length ? inferredModes : isStation ? ["unclassified"] : [];
      return [{
        type: "Feature" as const, id: feature.code, geometry: feature.geometry,
        properties: {
          code: feature.code, entity_code: entity.code, name_ar: stationDisplayName(entity.code, entity.name_ar), name_en: entity.name_en,
          type: entity.entity_type, status: entity.status, license: feature.license,
          attribution: feature.license === "ODbL-1.0" ? "© OpenStreetMap contributors, ODbL 1.0" : String(properties.attribution ?? ""),
          source: String(properties.source ?? ""), retrieval_date: String(properties.retrieval_date ?? ""),
          source_ids: properties.source_ids ?? [], line_codes: lineCodes.length ? lineCodes : entity.code.startsWith("TRANSIT-") ? [entity.code] : [],
          primary_line_code: lineCodes[0] ?? (entity.code.startsWith("TRANSIT-") ? entity.code : null), modes,
          interchange: modes.length > 1 || isTransitInterchangeEntityCode(entity.code),
        },
      }];
    }),
  };
}
