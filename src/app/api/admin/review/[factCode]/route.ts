import { NextResponse } from "next/server";
import { enforceAdminWriteRateLimit, resolveAdminIdentity } from "@/lib/admin/auth";
import { applyFactReview, attachEvidence, liveExecutor } from "@/lib/admin/mutations";
import { toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BATCH 13 — POST /api/admin/review/:factCode
 *
 * Body: `{ action: "approve" | "reject" | "dispute" | "reset", reason?, expected_state? }`
 * or   `{ attach: { stance, evidence_code, reason } }` to link evidence to the fact.
 *
 * Auth is enforced before the body is read; the token never leaves the server. Every successful call
 * writes an audit row (see lib/admin/mutations.ts).
 */
export async function POST(request: Request, context: { params: Promise<{ factCode: string }> }) {
  try {
    const identity = resolveAdminIdentity(request);
    enforceAdminWriteRateLimit(identity);
    const { factCode } = await context.params;
    const code = decodeURIComponent(factCode);
    const body = await request.json() as Record<string, unknown>;
    const context2 = { actor: identity.actor, token_fingerprint: identity.token_fingerprint };
    const result = typeof body.attach === "object" && body.attach !== null
      ? await attachEvidence(liveExecutor(), context2, code, body.attach)
      : await applyFactReview(liveExecutor(), context2, code, body);
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
