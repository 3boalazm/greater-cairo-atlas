import { NextResponse } from "next/server";
import { CSV_TABLES, csvForTable, exportResponseHeaders } from "@/lib/atlas/export-api";
import { getStaticAtlasDataset, getExportMetadata } from "@/lib/atlas/static-dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const table = new URL(request.url).searchParams.get("table");
  if (!table || !CSV_TABLES.includes(table as (typeof CSV_TABLES)[number])) {
    return NextResponse.json({
      error: "Choose one CSV table: entities, facts, evidence, or fact_evidence.",
      available_tables: CSV_TABLES,
    }, { status: 400, headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  }
  const [dataset, metadata] = await Promise.all([getStaticAtlasDataset(), getExportMetadata()]);
  const csv = csvForTable(dataset, table as (typeof CSV_TABLES)[number]);
  return new NextResponse(csv, {
    headers: exportResponseHeaders(metadata, "text/csv; charset=utf-8", `greater-cairo-${table}.csv`),
  });
}
