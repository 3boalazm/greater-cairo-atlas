import { NextResponse } from "next/server";
import { getStaticMapFeatures } from "@/lib/atlas/static-map-features";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";
import { parseAtlasFeatureQuery } from "@/lib/atlas/features-api";
import { toApiErrorResponse } from "@/lib/errors";

/** Offline/database-error fallback. Coordinates are the unchanged checked-in snapshot. */
export async function GET(request: Request) {
  try {
    const filter = parseAtlasFeatureQuery(new URL(request.url).searchParams);
    const [collection, dataset] = await Promise.all([getStaticMapFeatures(), getStaticAtlasDataset()]);
    const sectors = new Map(dataset.entities.map((entity) => [entity.code, entity.sector]));
    return NextResponse.json({ ...collection, features: collection.features.filter((feature) =>
      (!filter.type || feature.properties.type === filter.type) &&
      (!filter.sector || sectors.get(feature.properties.entity_code) === filter.sector) &&
      (!filter.status || feature.properties.status === filter.status)) }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) { return toApiErrorResponse(error); }
}
