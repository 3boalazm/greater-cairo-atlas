import { NextResponse } from "next/server";
import { reviewSubmission } from "@/lib/atlas/submissions";
import { toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return NextResponse.json({ submission: await reviewSubmission(request, id, await request.json()) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return toApiErrorResponse(error); }
}
