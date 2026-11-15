import { NextResponse } from "next/server";
import { getStaticEvidenceDetail } from "@/lib/atlas/static-dataset";
import { toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const detail = await getStaticEvidenceDetail(code);
    if (!detail) return NextResponse.json({ ok: false, error: { code: "EVIDENCE_NOT_FOUND", message: "Evidence record not found." } }, { status: 404 });
    return NextResponse.json(detail, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
