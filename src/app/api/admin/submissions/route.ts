import { NextResponse } from "next/server";
import { listSubmissions } from "@/lib/atlas/submissions";
import { toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { return NextResponse.json({ submissions: await listSubmissions(request) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return toApiErrorResponse(error); }
}
