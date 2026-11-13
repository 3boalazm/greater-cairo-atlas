import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { RequestValidationError } from "@/lib/errors";

const featureQuerySchema = z.strictObject({
  type: z.enum(["road", "transit_line", "transit_stop", "transit_station", "rail_station"]).optional(),
  sector: z.enum(["NORTH", "EAST", "SOUTH", "WEST", "CENTRAL", "REGIONAL"]).optional(),
  status: z.enum(["operational", "partial", "under_construction", "planned", "approved_planned", "unknown"]).optional(),
  zoom: z.coerce.number().int().min(4).max(20).default(12),
});

export interface AtlasFeatureQuery {
  type?: string;
  sector?: string;
  status?: string;
  zoom: number;
}

export interface FeatureCollectionRow {
  code: string;
  entity_code: string;
  name_ar: string;
  name_en: string;
  entity_type: string;
  status: string;
  geometry: unknown;
  license: string;
  attribution: string;
  source: string;
  retrieval_date: string;
  source_ids: unknown;
}

export interface AtlasFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    geometry: unknown;
    properties: {
      code: string;
      entity_code: string;
      name_ar: string;
      name_en: string;
      type: string;
      status: string;
      license: string;
      attribution: string;
      source: string;
      retrieval_date: string;
      source_ids: unknown;
    };
  }>;
}

export type FeatureRowsExecutor = (filters: AtlasFeatureQuery) => Promise<FeatureCollectionRow[]>;

export function parseAtlasFeatureQuery(params: URLSearchParams): AtlasFeatureQuery {
  const input: Record<string, string> = {};
  for (const key of ["type", "sector", "status", "zoom"] as const) {
    const value = params.get(key);
    if (value !== null) input[key] = value;
  }
  const parsed = featureQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new RequestValidationError("Invalid feature query parameters.", parsed.error.issues.map((issue) => ({
      path: issue.path.join("."), message: issue.message,
    })));
  }
  return parsed.data;
}

const defaultFeatureRowsExecutor: FeatureRowsExecutor = async (filters) => {
  const sql = getSql();
  const tolerance = filters.zoom <= 7 ? 0.004 : filters.zoom <= 9 ? 0.001 : filters.zoom <= 11 ? 0.0002 : 0;
  const rows = await sql.query(
    `
    SELECT f.code, e.code AS entity_code, e.name_ar, e.name_en,
           e.entity_type, e.status,
           ST_AsGeoJSON(
             CASE WHEN $4::double precision > 0
               THEN ST_SimplifyPreserveTopology(f.geometry, $4::double precision)
               ELSE f.geometry END,
             6
           )::jsonb AS geometry,
           f.license,
           f.properties ->> 'attribution' AS attribution,
           f.properties ->> 'source' AS source,
           f.properties ->> 'retrieval_date' AS retrieval_date,
           f.properties -> 'source_ids' AS source_ids
      FROM features f
      JOIN entities e ON e.id = f.entity_id
     WHERE ($1::text IS NULL OR e.entity_type = $1)
       AND ($2::text IS NULL OR e.sector = $2)
       AND ($3::text IS NULL OR e.status = $3)
     ORDER BY e.entity_type, e.code, f.code
     LIMIT 1000
    `,
    [filters.type ?? null, filters.sector ?? null, filters.status ?? null, tolerance],
  );
  return rows as FeatureCollectionRow[];
};

export async function getAtlasFeatures(
  filters: AtlasFeatureQuery,
  executeRows: FeatureRowsExecutor = defaultFeatureRowsExecutor,
): Promise<AtlasFeatureCollection> {
  const rows = await executeRows(filters);
  return {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      id: row.code,
      geometry: typeof row.geometry === "string" ? JSON.parse(row.geometry) : row.geometry,
      properties: {
        code: row.code,
        entity_code: row.entity_code,
        name_ar: row.name_ar,
        name_en: row.name_en,
        type: row.entity_type,
        status: row.status,
        license: row.license,
        attribution: row.attribution,
        source: row.source,
        retrieval_date: row.retrieval_date,
        source_ids: row.source_ids,
      },
    })),
  };
}
