import { NextResponse } from "next/server";
import { resolveAdminIdentity } from "@/lib/admin/auth";
import { listAuditRows } from "@/lib/admin/mutations";
import { toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** BATCH 13 — GET /api/admin/audit?entity=&fact=&limit= — the append-only trail, newest first. */
export async function GET(request: Request) {
  try {
    resolveAdminIdentity(request);
    const params = new URL(request.url).searchParams;
    const limit = Number.parseInt(params.get("limit") ?? "50", 10);
    const rows = await listAuditRows(undefined, {
      entity_code: params.get("entity") ?? undefined,
      fact_code: params.get("fact") ?? undefined,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return NextResponse.json({ ok: true, rows }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
