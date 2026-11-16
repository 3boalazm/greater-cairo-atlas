import { NextResponse } from "next/server";
import { getAtlasEntityDetail } from "@/lib/atlas/entities-api";
import { toApiErrorResponse, type ApiErrorBody } from "@/lib/errors";
import { getAreaBoundaryCodes, getPointOutsideBoundaryFindings } from "@/lib/atlas/area-boundaries";
import { getStaticEntityNeighbors, getStaticEntityRelations } from "@/lib/atlas/static-dataset";

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
    const [boundaryCodes, relations, neighbors, pointOutside] = await Promise.all([
      getAreaBoundaryCodes(), getStaticEntityRelations(entity.code), getStaticEntityNeighbors(entity.code),
      getPointOutsideBoundaryFindings(),
    ]);
    // BATCH 12.5 — a recorded point that falls outside the entity's own official boundary. The point is
    // reported, never moved, so the researcher view can flag it for human review.
    const outsideFinding = pointOutside.get(entity.code) ?? null;
    return NextResponse.json({
      ...entity,
      has_boundary: boundaryCodes.has(entity.code),
      point_outside_boundary: outsideFinding ? {
        distance_outside_m: outsideFinding.distance_outside_m,
        inside_osm_boundary: outsideFinding.inside_osm_boundary,
        round_coordinate: outsideFinding.round_coordinate,
      } : null,
      relations, neighbors,
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
