import { NextResponse } from "next/server";
import { getAtlasFeatures, parseAtlasFeatureQuery } from "@/lib/atlas/features-api";
import { logger } from "@/lib/logger";
import { normalizeUnknownError, redactSecrets, toApiErrorResponse, type ApiErrorBody } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse | NextResponse<ApiErrorBody>> {
  try {
    const filters = parseAtlasFeatureQuery(new URL(request.url).searchParams);
    const collection = await getAtlasFeatures(filters);
    return NextResponse.json(collection, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "Content-Type": "application/geo+json; charset=utf-8",
      },
    });
  } catch (error) {
    const normalized = normalizeUnknownError(error);
    if (normalized.statusCode >= 500) {
      const value = error && typeof error === "object" ? error as Record<string, unknown> : null;
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Atlas features request failed", {
        route: "/api/atlas/features",
        query: "atlas_features_geojson_by_filter_and_zoom",
        error_name: error instanceof Error ? error.name : typeof value?.name === "string" ? value.name : "NonError",
        error_message: redactSecrets(message),
        postgres_code: typeof value?.code === "string" ? value.code : null,
      });
    }
    return toApiErrorResponse(error);
  }
}
