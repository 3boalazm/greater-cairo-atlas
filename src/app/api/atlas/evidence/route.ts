import { NextResponse } from "next/server";
import { getStaticEvidenceCatalog } from "@/lib/atlas/static-dataset";
import { toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const evidence = await getStaticEvidenceCatalog();
    return NextResponse.json({ evidence }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
