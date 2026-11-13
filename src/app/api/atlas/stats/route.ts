import { NextResponse } from "next/server";
import {
  getAtlasTableStats,
  type AtlasStatsResponseBody,
} from "@/lib/atlas/stats";
import { toApiErrorResponse, type ApiErrorBody } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<
  NextResponse<AtlasStatsResponseBody | ApiErrorBody>
> {
  try {
    const { httpStatus, body } = await getAtlasTableStats();
    return NextResponse.json(body, {
      status: httpStatus,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
