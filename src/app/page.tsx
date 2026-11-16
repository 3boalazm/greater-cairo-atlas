import type { Metadata } from "next";
import AtlasApp from "@/components/atlas/AtlasApp";
import { getSiteUrl, localizedPath, resolveLanguage } from "@/components/site/SiteChrome";
import { getStaticMapFeatures } from "@/lib/atlas/static-map-features";
import { findGeometryAlternatives } from "@/lib/atlas/geometry-comparisons";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";
import type { AtlasEntitySummary, AtlasStatsResponse, AtlasTimelineStatusFact } from "@/components/atlas/atlas-client";

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
  const geometryCodes = new Set(dataset.features.map((feature) => feature.entity_code));
  const regionalCodes = [...new Set(dataset.entities.filter((entity) => entity.sector === "REGIONAL" || dataset.features.some((feature) => feature.entity_code === entity.code && hasOutOfRegionCoordinates(feature.geometry))).map((entity) => entity.code))];
  const initialEntities: AtlasEntitySummary[] = dataset.entities.map((entity) => ({
    code: entity.code, name_ar: entity.name_ar, name_en: entity.name_en, aliases: entity.aliases,
    entity_type: entity.entity_type, sector: entity.sector, status: entity.status, has_geometry: geometryCodes.has(entity.code),
  }));
  const initialFeatures = await getStaticMapFeatures();
  const initialAlternatives = [...findGeometryAlternatives(initialFeatures.features)];
  const initialStats: AtlasStatsResponse = { ok: true, counts: {
    entities: dataset.entities.length, facts: dataset.facts.length, evidence: dataset.evidence.length,
    features: dataset.features.length, fact_evidence: dataset.factEvidence.length,
  } };
  const statusTimeline: AtlasTimelineStatusFact[] = dataset.facts.filter((fact) => fact.attribute === "operational_status" && fact.valid_as_of).map((fact) => ({
    entity_code: fact.entity_code, attribute: fact.attribute, value: fact.value, valid_as_of: fact.valid_as_of!,
    valid_as_of_precision: fact.valid_as_of_precision, verification_state: fact.verification_state, fact_code: fact.code,
  }));
  const language = resolveLanguage((await searchParams).lang);
  return <AtlasApp initialEntities={initialEntities} initialAlternatives={initialAlternatives} initialStats={initialStats} initialLanguage={language} regionalCodes={regionalCodes} statusTimeline={statusTimeline} />;
}
