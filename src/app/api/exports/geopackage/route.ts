import { NextResponse } from "next/server";
import { getPublicAtlasDataset } from "@/lib/atlas/static-dataset";
import { generateGeoPackage, parseGeoPackageFilters } from "@/lib/atlas/geopackage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  let filters;
  try { filters = parseGeoPackageFilters(new URL(request.url).searchParams); }
  catch (error) { return NextResponse.json({ error: { message: error instanceof Error ? error.message : "Invalid filter." } }, { status: 400 }); }
  const bytes = await generateGeoPackage(await getPublicAtlasDataset(), filters);
  const body = new Uint8Array(bytes).buffer;
  const filterToken = [filters.type, filters.sector, filters.status, filters.year].filter((value) => value !== undefined).join("-") || "all";
  return new Response(body, { headers: {
    "Content-Type": "application/geopackage+sqlite3",
    "Content-Disposition": `attachment; filename="greater-cairo-atlas-${filterToken}.gpkg"`,
    "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
    "X-Atlas-License": "Research data CC BY 4.0; OpenStreetMap geometry ODbL 1.0; licenses and attribution included in license_attribution table",
  } });
}
