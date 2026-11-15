import { NextResponse } from "next/server";
import { exportAcceptedSubmissions } from "@/lib/atlas/submissions";
import { toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { return NextResponse.json(await exportAcceptedSubmissions(request), { headers: { "Cache-Control": "no-store", "Content-Disposition": "attachment; filename=accepted-submissions-review.json" } }); }
  catch (error) { return toApiErrorResponse(error); }
}
