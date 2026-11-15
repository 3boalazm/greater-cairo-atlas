import { NextResponse } from "next/server";
import { createSubmission } from "@/lib/atlas/submissions";
import { toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as unknown;
    const result = await createSubmission(request, body);
    if (result.rateLimited) return NextResponse.json({ ok: false, error: { code: "RATE_LIMITED", message: "Submission limit reached. Try again later." } }, { status: 429, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } });
    return NextResponse.json({ ok: true, message: "Thank you. Your suggestion was sent for human review; atlas facts are never changed automatically." }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return toApiErrorResponse(error); }
}
