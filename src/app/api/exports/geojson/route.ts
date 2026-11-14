import { NextResponse } from "next/server";
import { exportResponseHeaders } from "@/lib/atlas/export-api";
import { getExportMetadata, getStaticAtlasDataset, joinedFeatureCollection } from "@/lib/atlas/static-dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const [dataset, metadata] = await Promise.all([getStaticAtlasDataset(), getExportMetadata()]);
  return NextResponse.json(joinedFeatureCollection(dataset, metadata), {
    headers: exportResponseHeaders(metadata, "application/geo+json; charset=utf-8", "greater-cairo-atlas.geojson"),
  });
}
