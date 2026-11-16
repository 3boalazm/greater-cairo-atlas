import { NextResponse } from "next/server";
import path from "node:path";
import { getSeedDriftCodes } from "@/lib/atlas/drift";
import { loadAndValidateSeedDir } from "@/lib/atlas/seed";
import { defaultExecutor } from "@/lib/admin/queries";
import { resolveAdminIdentity } from "@/lib/admin/auth";
import { getAdminCounts } from "@/lib/admin/queries";
import { getAreaBoundaryCodes } from "@/lib/atlas/area-boundaries";
import { toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BATCH 13 — GET /api/admin/dashboard
 *
 * Boundaries are not a table: the count comes from the same boundary files the public map reads, so
 * the dashboard and the map can never disagree about how many official boundaries exist.
 */
export async function GET(request: Request) {
  try {
    resolveAdminIdentity(request);
    const counts = await getAdminCounts();
    const boundaryCodes = await getAreaBoundaryCodes();
    const seed = await loadAndValidateSeedDir(path.join(process.cwd(), "data/seed"));
    const drift = await getSeedDriftCodes((text, values) => defaultExecutor.query<{ code: string }>(text, values), seed);
    return NextResponse.json({ ok: true, counts: { ...counts, boundaries: boundaryCodes.size }, drift },
      { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
