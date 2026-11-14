import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { RequestValidationError } from "@/lib/errors";
import { atlasCodeSchema, ENTITY_SECTORS, ENTITY_STATUSES, ENTITY_TYPES } from "@/lib/atlas/schema";

const entityListQuerySchema = z.strictObject({
  q: z.string().trim().max(120).optional(),
  type: z.enum(ENTITY_TYPES).optional(),
  sector: z.enum(ENTITY_SECTORS).optional(),
  status: z.enum(ENTITY_STATUSES).optional(),
  has_geometry: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  limit: z.coerce.number().int().min(1).max(500).default(250),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export interface AtlasEntityListQuery {
  q?: string;
  type?: string;
  sector?: string;
  status?: string;
  has_geometry?: boolean;
  limit: number;
  offset: number;
}

export interface AtlasEntitySummary {
  code: string;
  name_ar: string;
  name_en: string;
  aliases: string[];
  entity_type: string;
  sector: string;
  status: string;
  has_geometry: boolean;
  has_boundary?: boolean;
}

export interface AtlasEntityListResult {
  entities: AtlasEntitySummary[];
  total: number;
  limit: number;
  offset: number;
}

export function parseAtlasEntityListQuery(params: URLSearchParams): AtlasEntityListQuery {
  const input: Record<string, string> = {};
  for (const key of ["q", "type", "sector", "status", "has_geometry", "limit", "offset"] as const) {
    const value = params.get(key);
    if (value !== null) input[key] = value;
  }
  const parsed = entityListQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new RequestValidationError("Invalid entity query parameters.", parsed.error.issues.map((issue) => ({
      path: issue.path.join("."), message: issue.message,
    })));
  }
  return { ...parsed.data, ...(parsed.data.q ? { q: parsed.data.q } : {}) };
}

export type EntityListExecutor = (query: AtlasEntityListQuery) => Promise<AtlasEntityListResult>;

const defaultEntityListExecutor: EntityListExecutor = async (filters) => {
  const sql = getSql();
  const q = filters.q || null;
  const values = [q, filters.type ?? null, filters.sector ?? null, filters.status ?? null, filters.has_geometry ?? null];
  const where = `
    WHERE ($1::text IS NULL OR
      strpos(lower(e.name_ar), lower($1)) > 0 OR
      strpos(lower(e.name_en), lower($1)) > 0 OR
      EXISTS (SELECT 1 FROM unnest(e.aliases) AS alias WHERE strpos(lower(alias), lower($1)) > 0))
      AND ($2::text IS NULL OR e.entity_type = $2)
      AND ($3::text IS NULL OR e.sector = $3)
      AND ($4::text IS NULL OR e.status = $4)
      AND ($5::boolean IS NULL OR EXISTS (SELECT 1 FROM features f WHERE f.entity_id = e.id) = $5)
  `;
  const [countRows, rows] = await Promise.all([
    sql.query(`SELECT COUNT(*)::int AS total FROM entities e ${where}`, values),
    sql.query(
      `SELECT e.code, e.name_ar, e.name_en, e.aliases, e.entity_type, e.sector, e.status,
              EXISTS (SELECT 1 FROM features f WHERE f.entity_id = e.id) AS has_geometry
         FROM entities e ${where}
        ORDER BY e.entity_type, e.name_ar, e.code
        LIMIT $6 OFFSET $7`,
      [...values, filters.limit, filters.offset],
    ),
  ]);
  const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);
  return { entities: rows as AtlasEntitySummary[], total, limit: filters.limit, offset: filters.offset };
};

export async function getAtlasEntities(
  filters: AtlasEntityListQuery,
  execute: EntityListExecutor = defaultEntityListExecutor,
): Promise<AtlasEntityListResult> {
  return execute(filters);
}

export interface AtlasEvidenceItem {
  code: string;
  url: string | null;
  publisher: string;
  title: string;
  source_type: string;
  published_date: string | null;
  accessed_date: string | null;
}

export interface AtlasEntityFact {
  code: string;
  attribute: string;
  value: string;
  unit: string | null;
  valid_as_of: string | null;
  valid_as_of_precision: "day" | "month" | "year";
  verification_state: string;
  notes: string | null;
  evidence: AtlasEvidenceItem[];
}

export interface AtlasEntityDetail extends AtlasEntitySummary {
  description: string | null;
  facts: AtlasEntityFact[];
}

export interface AtlasEntityDetailExecutor {
  entity(code: string): Promise<Omit<AtlasEntityDetail, "facts"> | null>;
  facts(code: string): Promise<AtlasEntityFact[]>;
}

const defaultEntityDetailExecutor: AtlasEntityDetailExecutor = {
  async entity(code) {
    const sql = getSql();
    const rows = await sql.query(
      `SELECT e.code, e.name_ar, e.name_en, e.aliases, e.entity_type, e.sector, e.status, e.description,
              EXISTS (SELECT 1 FROM features f WHERE f.entity_id = e.id) AS has_geometry
         FROM entities e WHERE e.code = $1 LIMIT 1`,
      [code],
    );
    return (rows as Array<Omit<AtlasEntityDetail, "facts">>)[0] ?? null;
  },
  async facts(code) {
    const sql = getSql();
    const rows = await sql.query(
      `SELECT f.code, f.attribute, f.value, f.unit, f.valid_as_of::text AS valid_as_of,
              f.valid_as_of_precision, f.verification_state, f.notes,
              COALESCE(jsonb_agg(jsonb_build_object(
                'code', ev.code, 'url', ev.url, 'publisher', ev.publisher, 'title', ev.title,
                'source_type', ev.source_type, 'published_date', ev.published_date::text,
                'accessed_date', ev.accessed_date::text
              ) ORDER BY ev.code) FILTER (WHERE ev.id IS NOT NULL), '[]'::jsonb) AS evidence
         FROM facts f
         JOIN entities e ON e.id = f.entity_id
         LEFT JOIN fact_evidence fe ON fe.fact_id = f.id
         LEFT JOIN evidence ev ON ev.id = fe.evidence_id
        WHERE e.code = $1
        GROUP BY f.id, f.code, f.attribute, f.value, f.unit, f.valid_as_of,
                 f.valid_as_of_precision, f.verification_state, f.notes
        ORDER BY f.attribute, CASE f.verification_state
          WHEN 'verified' THEN 0 WHEN 'corroborated' THEN 1 WHEN 'disputed' THEN 2
          WHEN 'candidate' THEN 3 WHEN 'single_source' THEN 4 WHEN 'superseded' THEN 5
          WHEN 'rejected' THEN 6 ELSE 7 END, f.code`,
      [code],
    );
    return rows as AtlasEntityFact[];
  },
};

export async function getAtlasEntityDetail(
  rawCode: string,
  execute: AtlasEntityDetailExecutor = defaultEntityDetailExecutor,
): Promise<AtlasEntityDetail | null> {
  const parsed = atlasCodeSchema.safeParse(rawCode);
  if (!parsed.success) {
    throw new RequestValidationError("Invalid entity code.", parsed.error.issues.map((issue) => ({
      path: "code", message: issue.message,
    })));
  }
  const entity = await execute.entity(parsed.data);
  if (!entity) return null;
  const facts = await execute.facts(parsed.data);
  return { ...entity, facts };
}
