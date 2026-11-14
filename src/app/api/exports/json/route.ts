import { NextResponse } from "next/server";
import { exportResponseHeaders } from "@/lib/atlas/export-api";
import { getExportMetadata, getStaticAtlasDataset } from "@/lib/atlas/static-dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const [dataset, metadata] = await Promise.all([getStaticAtlasDataset(), getExportMetadata()]);
  return NextResponse.json({
    metadata: {
      ...metadata,
      licence_notice: metadata.licenses,
    },
    entities: dataset.entities,
    facts: dataset.facts,
    evidence: dataset.evidence,
    fact_evidence: dataset.factEvidence,
    features: dataset.features,
  }, { headers: exportResponseHeaders(metadata, "application/json; charset=utf-8", "greater-cairo-atlas.json") });
}
