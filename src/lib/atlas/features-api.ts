import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { RequestValidationError } from "@/lib/errors";
import { ENTITY_SECTORS, ENTITY_STATUSES, ENTITY_TYPES } from "@/lib/atlas/schema";
import { isTransitInterchangeEntityCode, transitModesForEntityCode, type TransitMode } from "@/lib/atlas/transit-modes";
import { stationDisplayName } from "@/lib/atlas/labels";

const featureQuerySchema = z.strictObject({
  type: z.union([z.enum(ENTITY_TYPES), z.literal("admin_unit")]).optional(),
  level: z.enum(["2", "3"]).optional(),
  sector: z.enum(ENTITY_SECTORS).optional(),
  status: z.enum(ENTITY_STATUSES).optional(),
  zoom: z.coerce.number().int().min(4).max(20).default(12),
});

export interface AtlasFeatureQuery {
  type?: string;
  level?: "2" | "3";
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
  line_codes?: unknown;
}

export interface AtlasFeatureCollection {
  type: "FeatureCollection";
  metadata: {
    data_license: string;
    geometry_license: string;
    contact: string;
  };
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
      modes: string[];
      interchange: boolean;
    };
  }>;
}

export type FeatureRowsExecutor = (filters: AtlasFeatureQuery) => Promise<FeatureCollectionRow[]>;

export function parseAtlasFeatureQuery(params: URLSearchParams): AtlasFeatureQuery {
  const input: Record<string, string> = {};
  for (const key of ["type", "level", "sector", "status", "zoom"] as const) {
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

export const ATLAS_FEATURES_SQL = `
  SELECT f.code, e.code AS entity_code, e.name_ar, e.name_en, e.entity_type, e.status,
         ST_AsGeoJSON(
           CASE WHEN $4::double precision > 0
             THEN ST_SimplifyPreserveTopology(f.geometry, $4::double precision)
             ELSE f.geometry END,
           6
         )::jsonb AS geometry,
         f.license,
         CASE WHEN f.license = 'ODbL-1.0' THEN '© OpenStreetMap contributors, ODbL 1.0'
              ELSE f.properties ->> 'attribution' END AS attribution,
         f.properties ->> 'source' AS source,
         f.properties ->> 'retrieval_date' AS retrieval_date,
         jsonb_build_array(f.properties -> 'source_ids') AS source_ids,
         COALESCE(f.properties -> 'matched_line_codes', '[]'::jsonb) AS line_codes
    FROM features f
    JOIN entities e ON e.id = f.entity_id
   WHERE ($1::text IS NULL OR e.entity_type = $1)
     AND ($2::text IS NULL OR e.sector = $2)
     AND ($3::text IS NULL OR e.status = $3)
   ORDER BY e.entity_type, e.code, f.code
   LIMIT 5000
`;

export function featureSimplificationTolerance(zoom: number): number {
  return zoom <= 7 ? 0.004 : zoom <= 9 ? 0.001 : zoom <= 11 ? 0.0002 : 0;
}

const defaultFeatureRowsExecutor: FeatureRowsExecutor = async (filters) => {
  const sql = getSql();
  const tolerance = featureSimplificationTolerance(filters.zoom);
  const rows = await sql.query(
    ATLAS_FEATURES_SQL,
    [filters.type ?? null, filters.sector ?? null, filters.status ?? null, tolerance],
  );
  return rows as FeatureCollectionRow[];
};

export async function getAtlasFeatures(
  filters: AtlasFeatureQuery,
  executeRows: FeatureRowsExecutor = defaultFeatureRowsExecutor,
): Promise<AtlasFeatureCollection> {
  if (filters.type === "admin_unit") {
    const file = path.join(process.cwd(), "data/features/codab-admin-units.geojson");
    const collection = JSON.parse(await readFile(file, "utf8")) as { features: Array<{ id: string; geometry: unknown; properties: Record<string, unknown> }> };
    const features = collection.features.filter((feature) => !filters.level || String(feature.properties.level) === filters.level);
    return {
      type: "FeatureCollection",
      metadata: {
        data_license: "CAPMAS COD-AB 2017 (reviewed 2024), CC BY-IGO",
        geometry_license: "CC BY-IGO",
        contact: "CAPMAS / OCHA HDX",
      },
      features: features.map((feature) => ({
        type: "Feature", id: feature.id, geometry: feature.geometry,
        properties: {
          code: String(feature.properties.code), entity_code: String(feature.properties.pcode),
          name_ar: String(feature.properties.name_ar), name_en: String(feature.properties.name_en ?? ""),
          pcode: String(feature.properties.pcode), level: Number(feature.properties.level),
          parent_pcodes: Array.isArray(feature.properties.parent_pcodes) ? feature.properties.parent_pcodes.map(String) : [],
          parent_name_ar: String(feature.properties.parent_name_ar ?? ""), area_sqkm: Number(feature.properties.area_sqkm),
          type: "admin_unit", status: "unknown", license: "CC BY-IGO",
          attribution: String(feature.properties.attribution), source: String(feature.properties.source),
          retrieval_date: "2026-11-15", source_ids: { pcode: feature.properties.pcode, level: feature.properties.level,
            parent_pcodes: feature.properties.parent_pcodes, area_sqkm: feature.properties.area_sqkm },
          modes: [], interchange: false,
        },
      })),
    };
  }
  const rows = await executeRows(filters);
  return {
    type: "FeatureCollection",
    metadata: {
      data_license: "© Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0",
      geometry_license: "© OpenStreetMap contributors, ODbL 1.0",
      contact: "01092500454 · 3boalazm@gmail.com",
    },
    features: rows.map((row) => {
      const lineCodes = Array.isArray(row.line_codes) ? row.line_codes.filter((item): item is string => typeof item === "string") : row.entity_code.startsWith("TRANSIT-") ? [row.entity_code] : [];
      const inferredModes = transitModesForEntityCode(row.entity_code, lineCodes);
      const isStation = row.entity_type === "transit_stop" || row.entity_type === "rail_station";
      const modes: TransitMode[] = inferredModes.length ? inferredModes : isStation ? ["unclassified"] : [];
      return {
      type: "Feature",
      id: row.code,
      geometry: typeof row.geometry === "string" ? JSON.parse(row.geometry) : row.geometry,
      properties: {
        code: row.code,
        entity_code: row.entity_code,
        name_ar: stationDisplayName(row.entity_code, row.name_ar),
        name_en: row.name_en,
        type: row.entity_type,
        status: row.status,
        license: row.license,
        attribution: row.license.split(",").includes("ODbL-1.0")
          ? "© OpenStreetMap contributors, ODbL 1.0"
          : row.attribution,
        source: row.source,
        retrieval_date: row.retrieval_date,
        source_ids: row.source_ids,
        line_codes: lineCodes,
        primary_line_code: lineCodes[0] ?? (row.entity_code.startsWith("TRANSIT-") ? row.entity_code : null),
        modes,
        interchange: modes.length > 1 || isTransitInterchangeEntityCode(row.entity_code),
      },
    }; }),
  };
}
