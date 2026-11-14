import { NextResponse } from "next/server";
import { getAtlasEntityDetail } from "@/lib/atlas/entities-api";
import { toApiErrorResponse, type ApiErrorBody } from "@/lib/errors";
import { getAreaBoundaryCodes } from "@/lib/atlas/area-boundaries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<NextResponse | NextResponse<ApiErrorBody>> {
  try {
    const { code } = await context.params;
    const entity = await getAtlasEntityDetail(code);
    if (!entity) {
      return NextResponse.json({ ok: false, error: { code: "ENTITY_NOT_FOUND", message: "Entity not found." } }, {
        status: 404,
        headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
      });
    }
    const boundaryCodes = await getAreaBoundaryCodes();
    return NextResponse.json({ ...entity, has_boundary: boundaryCodes.has(entity.code) }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
