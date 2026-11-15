import { NextResponse } from "next/server";
import { getExportMetadata, getStaticEntityPageData } from "@/lib/atlas/static-dataset";
import { exportResponseHeaders } from "@/lib/atlas/export-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  const { code } = await context.params;
  const [entity, metadata] = await Promise.all([getStaticEntityPageData(code), getExportMetadata()]);
  if (!entity) return NextResponse.json({ error: { code: "ENTITY_NOT_FOUND", message: "Entity not found." } }, { status: 404 });
  return NextResponse.json({ metadata: { ...metadata, research_data_license: "CC BY 4.0", geometry_license: entity.mapLicense, geometry_attribution: entity.mapAttribution }, entity: {
    code: entity.code, name_ar: entity.name_ar, name_en: entity.name_en, entity_type: entity.entity_type, sector: entity.sector, status: entity.status, aliases: entity.aliases, description: entity.description,
  }, facts: entity.facts, geometry: entity.mapGeometry, geometry_license: entity.mapLicense, geometry_attribution: entity.mapAttribution }, {
    headers: exportResponseHeaders(metadata, "application/json; charset=utf-8", `${code.toLowerCase()}-atlas-export.json`),
  });
}
