import type { Metadata } from "next";
import AtlasApp from "@/components/atlas/AtlasApp";
import { getSiteUrl, localizedPath, resolveLanguage } from "@/components/site/SiteChrome";
import { transitModesForEntityCode, isTransitInterchangeEntityCode, type TransitMode } from "@/lib/atlas/transit-modes";
import { stationDisplayName } from "@/lib/atlas/labels";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";
import type { AtlasEntitySummary, AtlasFeatureCollection, AtlasStatsResponse, AtlasTimelineStatusFact } from "@/components/atlas/atlas-client";

function hasOutOfRegionCoordinates(geometry: unknown): boolean {
  const visit = (value: unknown): boolean => {
    if (!Array.isArray(value)) return false;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      const [lon, lat] = value as [number, number];
      return lon < 30.5 || lon > 32.1 || lat < 29.2 || lat > 30.8;
    }
    return value.some(visit);
  };
  return !!geometry && typeof geometry === "object" && "coordinates" in geometry && visit((geometry as { coordinates: unknown }).coordinates);
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }): Promise<Metadata> {
  const language = resolveLanguage((await searchParams).lang);
  const canonical = `${getSiteUrl()}${localizedPath(language)}`;
  return {
    title: language === "ar" ? "أطلس القاهرة الكبرى" : "Greater Cairo Atlas",
    description: language === "ar"
      ? "أطلس جغرافي موثق للقاهرة الكبرى، يحفظ مصادر الحقائق ويعرض التعارضات دون استنتاج الهندسة أو الحالة."
      : "A source-backed geospatial atlas of Greater Cairo that preserves provenance and conflicting claims without inferring geometry or status.",
    alternates: { canonical, languages: { ar: `${getSiteUrl()}/ar`, en: `${getSiteUrl()}/en` } },
  };
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const dataset = await getStaticAtlasDataset();
  const entityByCode = new Map(dataset.entities.map((entity) => [entity.code, entity]));
  const geometryCodes = new Set(dataset.features.map((feature) => feature.entity_code));
  const regionalCodes = [...new Set(dataset.entities.filter((entity) => entity.sector === "REGIONAL" || dataset.features.some((feature) => feature.entity_code === entity.code && hasOutOfRegionCoordinates(feature.geometry))).map((entity) => entity.code))];
  const initialEntities: AtlasEntitySummary[] = dataset.entities.map((entity) => ({
    code: entity.code, name_ar: entity.name_ar, name_en: entity.name_en, aliases: entity.aliases,
    entity_type: entity.entity_type, sector: entity.sector, status: entity.status, has_geometry: geometryCodes.has(entity.code),
  }));
  const initialFeatures: AtlasFeatureCollection = {
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
  const initialStats: AtlasStatsResponse = { ok: true, counts: {
    entities: dataset.entities.length, facts: dataset.facts.length, evidence: dataset.evidence.length,
    features: dataset.features.length, fact_evidence: dataset.factEvidence.length,
  } };
  const statusTimeline: AtlasTimelineStatusFact[] = dataset.facts.filter((fact) => fact.attribute === "operational_status" && fact.valid_as_of).map((fact) => ({
    entity_code: fact.entity_code, attribute: fact.attribute, value: fact.value, valid_as_of: fact.valid_as_of!,
    valid_as_of_precision: fact.valid_as_of_precision, verification_state: fact.verification_state, fact_code: fact.code,
  }));
  const language = resolveLanguage((await searchParams).lang);
  return <AtlasApp initialEntities={initialEntities} initialFeatures={initialFeatures} initialStats={initialStats} initialLanguage={language} regionalCodes={regionalCodes} statusTimeline={statusTimeline} />;
}
