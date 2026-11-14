import { NextResponse } from "next/server";
import { getAreaBoundary } from "@/lib/atlas/area-boundaries";
import { atlasCodeSchema } from "@/lib/atlas/schema";
import { RequestValidationError, toApiErrorResponse, type ApiErrorBody } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<NextResponse | NextResponse<ApiErrorBody>> {
  try {
    const { code: rawCode } = await context.params;
    const parsed = atlasCodeSchema.safeParse(rawCode);
    if (!parsed.success) {
      throw new RequestValidationError("Invalid entity code.", parsed.error.issues.map((issue) => ({
        path: "code", message: issue.message,
      })));
    }
    const feature = await getAreaBoundary(parsed.data);
    if (!feature) {
      return NextResponse.json({ ok: false, error: {
        code: "BOUNDARY_NOT_AVAILABLE", message: "No source boundary is available for this entity.",
      } }, { status: 404, headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
    }
    return NextResponse.json({ type: "FeatureCollection", metadata: {
      geometry_license: "© OpenStreetMap contributors, ODbL 1.0",
      attribution: "© OpenStreetMap contributors, ODbL 1.0",
    }, features: [feature] }, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Atlas-Geometry-Attribution": "© OpenStreetMap contributors, ODbL 1.0",
        "Content-Type": "application/geo+json; charset=utf-8",
      },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
