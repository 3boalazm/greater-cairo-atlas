import { NextResponse } from "next/server";
import {
  runDatabaseHealthCheck,
  type HealthCheckResponseBody,
} from "@/lib/db/health";
import { toApiErrorResponse, type ApiErrorBody } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<
  NextResponse<HealthCheckResponseBody | ApiErrorBody>
> {
  try {
    const { httpStatus, body } = await runDatabaseHealthCheck();
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
