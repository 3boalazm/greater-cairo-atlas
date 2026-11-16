import { NextResponse } from "next/server";
import { getPublicAtlasDataset } from "@/lib/atlas/static-dataset";
import {
  getAtlasTableStats,
  type AtlasStatsResponseBody,
} from "@/lib/atlas/stats";
import { toApiErrorResponse, type ApiErrorBody } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<
  NextResponse<AtlasStatsResponseBody | ApiErrorBody>
> {
  try {
    const { httpStatus, body } = await getAtlasTableStats();
    // Exports are the canonical checked-in snapshot; expose counts for that same
    // snapshot rather than mixing in DB-only drift. The query above still checks DB health.
    if (body.ok) {
      const dataset = await getPublicAtlasDataset();
      body.counts = { entities: dataset.entities.length, facts: dataset.facts.length,
        evidence: dataset.evidence.length, fact_evidence: dataset.factEvidence.length,
        features: dataset.features.length };
    }
    return NextResponse.json(body, {
      status: httpStatus,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
