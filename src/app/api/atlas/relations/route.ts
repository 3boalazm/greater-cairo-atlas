import { NextResponse } from "next/server";
import { getCodabLocatedWithin, getStaticEntityRelations } from "@/lib/atlas/static-dataset";
import { toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get("code")?.trim() || undefined;
    const [relations, boundaryRelation] = await Promise.all([
      getStaticEntityRelations(code), code ? getCodabLocatedWithin(code) : Promise.resolve(null),
    ]);
    return NextResponse.json({ relations, boundary_relations: boundaryRelation ? [boundaryRelation] : [] }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
