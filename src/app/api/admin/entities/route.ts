import { NextResponse } from "next/server";
import { resolveAdminIdentity } from "@/lib/admin/auth";
import { getEntityFilterOptions, listEntities, listFactsForReview } from "@/lib/admin/queries";
import { getAreaBoundaryCodes } from "@/lib/atlas/area-boundaries";
import { toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BATCH 13 — GET /api/admin/entities?q=&type=&sector=&status=&geometry=&boundary=&page=&page_size=
 * and GET /api/admin/entities?facts=1&state=pending for the review queue.
 *
 * Read-only, but still behind admin auth: the queue exposes unpublished research state.
 */
export async function GET(request: Request) {
  try {
    resolveAdminIdentity(request);
    const params = new URL(request.url).searchParams;
    if (params.get("facts") === "1") {
      const page = Number.parseInt(params.get("page") ?? "1", 10);
      const pageSize = Number.parseInt(params.get("page_size") ?? "25", 10);
      const result = await listFactsForReview({
        state: params.get("state") ?? "pending",
        entity_code: params.get("entity_code") ?? undefined,
        q: params.get("q") ?? undefined,
        page: Number.isFinite(page) ? page : 1,
        page_size: Number.isFinite(pageSize) ? pageSize : 25,
      });
      return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    if (params.get("options") === "1") {
      const options = await getEntityFilterOptions();
      return NextResponse.json({ ok: true, ...options }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    const booleanParam = (value: string | null): boolean | undefined => (value === "true" ? true : value === "false" ? false : undefined);
    const page = Number.parseInt(params.get("page") ?? "1", 10);
    const pageSize = Number.parseInt(params.get("page_size") ?? "25", 10);
    const boundaryCodes = await getAreaBoundaryCodes();
    const result = await listEntities({
      q: params.get("q") ?? undefined,
      entity_type: params.get("type") ?? undefined,
      sector: params.get("sector") ?? undefined,
      status: params.get("status") ?? undefined,
      has_geometry: booleanParam(params.get("geometry")),
      has_boundary: booleanParam(params.get("boundary")),
      page: Number.isFinite(page) ? page : 1,
      page_size: Number.isFinite(pageSize) ? pageSize : 25,
    }, undefined, [...boundaryCodes]);

    const rows = result.rows.map((row) => ({ ...row, has_boundary: boundaryCodes.has(row.code) }));
    const total = result.total;
    return NextResponse.json({ ok: true, rows, total, page: result.page, page_size: result.page_size }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
