import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveAdminIdentity } from "@/lib/admin/auth";
import { getSql } from "@/lib/db/client";
import { getPointOutsideBoundaryFindings } from "@/lib/atlas/area-boundaries";
import { toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GeometryRow {
  entity_code: string; name_ar: string; name_en: string; entity_type: string;
  feature_count: number; sources: string[]; licenses: string[];
  has_conflict: boolean; conflict_sources: string[]; point_outside_boundary: boolean;
}

/**
 * BATCH 13 — GET /api/admin/geometry?filter=missing|conflict|outside_boundary|all
 *
 * Sources and licences come from the stored feature rows; the "two sources disagree" flag comes from
 * the same comparison the public researcher view uses, so the admin screen cannot invent a conflict the
 * atlas does not show.
 */
export async function GET(request: Request) {
  try {
    resolveAdminIdentity(request);
    const filter = new URL(request.url).searchParams.get("filter") ?? "missing";
    const sql = getSql();

    const entityRows = await sql.query(
      `SELECT e.code AS entity_code, e.name_ar, e.name_en, e.entity_type,
              COUNT(f.id)::int AS feature_count,
              COALESCE(array_agg(DISTINCT f.osm_type) FILTER (WHERE f.osm_type IS NOT NULL), '{}') AS osm_types,
              COALESCE(array_agg(DISTINCT f.license), '{}') AS licenses
         FROM entities e
         LEFT JOIN features f ON f.entity_id = e.id
        GROUP BY e.code, e.name_ar, e.name_en, e.entity_type
        ORDER BY e.code`) as Array<{
          entity_code: string; name_ar: string; name_en: string; entity_type: string;
          feature_count: number; osm_types: string[]; licenses: string[];
        }>;

    // Conflict detection reuses the boundary file comparison: an entity with both an official CAPMAS
    // boundary and an OSM boundary is drawn from two sources.
    const official = new Set<string>();
    const osm = new Set<string>();
    const readCodes = async (file: string): Promise<string[]> => {
      try {
        const data = JSON.parse(await readFile(path.join(process.cwd(), "data/features", file), "utf8")) as {
          features?: Array<{ properties?: { entity_code?: string } }>;
        };
        return (data.features ?? []).flatMap((feature) => feature.properties?.entity_code ? [feature.properties.entity_code] : []);
      } catch { return []; }
    };
    for (const code of await readCodes("codab-entity-boundaries.geojson")) official.add(code);
    for (const code of await readCodes("boundaries.geojson")) osm.add(code);
    const outside = await getPointOutsideBoundaryFindings();

    const rows: GeometryRow[] = entityRows.map((row) => {
      const conflictSources: string[] = [];
      if (official.has(row.entity_code)) conflictSources.push("CAPMAS COD-AB");
      if (osm.has(row.entity_code)) conflictSources.push("OpenStreetMap");
      return {
        entity_code: row.entity_code,
        name_ar: row.name_ar,
        name_en: row.name_en,
        entity_type: row.entity_type,
        feature_count: Number(row.feature_count) || 0,
        sources: [
          ...(Number(row.feature_count) > 0 ? ["OpenStreetMap"] : []),
          ...(official.has(row.entity_code) ? ["CAPMAS COD-AB"] : []),
        ],
        licenses: row.licenses ?? [],
        has_conflict: conflictSources.length > 1,
        conflict_sources: conflictSources.length > 1 ? conflictSources : [],
        point_outside_boundary: outside.has(row.entity_code),
      };
    });

    const filtered = filter === "missing" ? rows.filter((row) => row.feature_count === 0)
      : filter === "conflict" ? rows.filter((row) => row.has_conflict)
        : filter === "outside_boundary" ? rows.filter((row) => row.point_outside_boundary)
          : rows;

    return NextResponse.json({ ok: true, rows: filtered }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
