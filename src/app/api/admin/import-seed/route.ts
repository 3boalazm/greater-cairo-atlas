import { NextResponse } from "next/server";
import {
  executeAdminSeedImport,
  type AdminSeedImportResponseBody,
} from "@/lib/atlas/admin-import";
import { toApiErrorResponse, type ApiErrorBody } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
): Promise<NextResponse<AdminSeedImportResponseBody | ApiErrorBody>> {
  try {
    const body = await executeAdminSeedImport({ request });
    return NextResponse.json(body, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
