import { NextResponse } from "next/server";
import { getAtlasFeatures, parseAtlasFeatureQuery } from "@/lib/atlas/features-api";
import { toApiErrorResponse, type ApiErrorBody } from "@/lib/errors";

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
    return toApiErrorResponse(error);
  }
}
