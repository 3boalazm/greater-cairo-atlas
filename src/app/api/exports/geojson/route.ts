import { NextResponse } from "next/server";
import { exportResponseHeaders } from "@/lib/atlas/export-api";
import { getExportMetadata, getStaticAtlasDataset, joinedFeatureCollection } from "@/lib/atlas/static-dataset";
import { parseGeoPackageFilters } from "@/lib/atlas/geopackage";
import { statusesAtYear } from "@/lib/atlas/status-timeline";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<NextResponse> {
  let filters;
  try { filters = parseGeoPackageFilters(new URL(request.url).searchParams); }
  catch (error) { return NextResponse.json({ error: { message: error instanceof Error ? error.message : "Invalid filter." } }, { status: 400 }); }
  const [dataset, metadata] = await Promise.all([getStaticAtlasDataset(), getExportMetadata()]);
  const timeline = filters.year ? statusesAtYear(dataset.facts.filter((fact) => fact.valid_as_of).map((fact) => ({
    entity_code: fact.entity_code, attribute: fact.attribute, value: fact.value, valid_as_of: fact.valid_as_of!, valid_as_of_precision: fact.valid_as_of_precision,
    verification_state: fact.verification_state, fact_code: fact.code,
  })), filters.year) : null;
  const transportTypes = ["transit_line", "transit_stop", "rail_station", "transit_station"];
  const entities = dataset.entities.filter((entity) => (!filters.type || (filters.type === "transport" ? transportTypes.includes(entity.entity_type) : entity.entity_type === filters.type)) && (!filters.sector || entity.sector === filters.sector) &&
    (!filters.status || (filters.year ? (timeline?.get(entity.code)?.status ?? "unknown") : entity.status) === filters.status));
  const entityByCode = new Map(entities.map((entity) => [entity.code, entity]));
  const filteredDataset = { ...dataset, entities, features: dataset.features.filter((feature) => entityByCode.has(feature.entity_code)) };
  const collection = joinedFeatureCollection(filteredDataset, metadata);
  const output = timeline ? { ...collection, features: collection.features.map((feature) => {
    const state = timeline.get(String(feature.properties.entity_code));
    return { ...feature, properties: { ...feature.properties, status: state?.status ?? "unknown",
      timeline_dated: state?.dated ?? false, timeline_verification: state?.verification_state ?? null, timeline_valid_as_of: state?.valid_as_of ?? null } };
  }) } : collection;
  return NextResponse.json(output, { headers: exportResponseHeaders(metadata, "application/geo+json; charset=utf-8", "greater-cairo-atlas-filtered.geojson") });
}
