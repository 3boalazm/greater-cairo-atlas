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
    const attribution = feature.properties.properties.attribution;
    const headerAttribution = feature.properties.license === "CC BY-IGO"
      ? "(c) CAPMAS via OCHA/HDX, CC BY-IGO"
      : "(c) OpenStreetMap contributors, ODbL 1.0";
    return NextResponse.json({ type: "FeatureCollection", metadata: {
      geometry_license: feature.properties.license,
      attribution,
    }, features: [feature] }, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Atlas-Geometry-Attribution": headerAttribution,
        "Content-Type": "application/geo+json; charset=utf-8",
      },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
