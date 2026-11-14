import { NextResponse } from "next/server";
import { getAtlasEntities, parseAtlasEntityListQuery } from "@/lib/atlas/entities-api";
import { toApiErrorResponse, type ApiErrorBody } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse | NextResponse<ApiErrorBody>> {
  try {
    const query = parseAtlasEntityListQuery(new URL(request.url).searchParams);
    const result = await getAtlasEntities(query);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
