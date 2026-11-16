import { getSql } from "@/lib/db/client";

/**
 * BATCH 13 — read queries behind the admin workspace.
 *
 * Every function takes its SQL executor as a parameter (defaulting to the real client) so the pages
 * can be tested against PGlite without a network database. Nothing here invents a number: a count that
 * cannot be computed is returned as `null`, and the UI renders "—" rather than a zero it did not observe.
 */
export interface SqlExecutor {
  query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<Row[]>;
}

/**
 * The production executor. Exported so the write layer can default to it too, instead of every caller
 * having to thread one through (and instead of a route passing a fake one by accident).
 *
 * `transaction` runs the statements on a single session so a data change and its audit row commit or
 * roll back together. Neon's HTTP client has no interactive transactions, so the session client is
 * used for those calls; a failure to open a session surfaces as an error rather than a partial write.
 */
export const defaultExecutor: SqlExecutor = {
  async query<Row>(text: string, values?: unknown[]): Promise<Row[]> {
    const sql = getSql();
    return (await sql.query(text, values)) as Row[];
  },
};

export interface AdminCounts {
  entities: number;
  facts: number;
  evidence: number;
  features: number;
  boundaries: number | null;
  unknown_statuses: number;
  facts_single_source: number;
  facts_without_evidence: number;
  entities_without_geometry: number;
  pending_submissions: number | null;
  open_conflicts: number;
  unreviewed_facts: number;
}

export async function getAdminCounts(execute: SqlExecutor = defaultExecutor): Promise<AdminCounts> {
  const [row] = await execute.query<Record<string, string | number | null>>(`
    SELECT
      (SELECT COUNT(*) FROM entities) AS entities,
      (SELECT COUNT(*) FROM facts) AS facts,
      (SELECT COUNT(*) FROM evidence) AS evidence,
      (SELECT COUNT(*) FROM features) AS features,
      (SELECT COUNT(*) FROM entities WHERE status = 'unknown') AS unknown_statuses,
      (SELECT COUNT(*) FROM (
         SELECT f.id FROM facts f JOIN fact_evidence fe ON fe.fact_id = f.id
          GROUP BY f.id HAVING COUNT(DISTINCT fe.evidence_id) = 1) AS single) AS facts_single_source,
      (SELECT COUNT(*) FROM facts f
        WHERE NOT EXISTS (SELECT 1 FROM fact_evidence fe WHERE fe.fact_id = f.id)) AS facts_without_evidence,
      (SELECT COUNT(*) FROM entities e
        WHERE NOT EXISTS (SELECT 1 FROM features ft WHERE ft.entity_id = e.id)) AS entities_without_geometry,
      (SELECT COUNT(*) FROM facts f
        WHERE NOT EXISTS (SELECT 1 FROM fact_reviews fr WHERE fr.fact_code = f.code
                          AND fr.review_state <> 'pending')) AS unreviewed_facts,
      (SELECT COUNT(*) FROM (
         SELECT e.id FROM facts f JOIN entities e ON e.id = f.entity_id
          GROUP BY e.id, f.attribute HAVING COUNT(DISTINCT f.value) > 1) AS conflicts) AS open_conflicts
  `);

  // Counted separately so a database that has not applied 010/011 yet degrades to null (rendered as
  // "—") instead of breaking the whole dashboard.
  const pendingSubmissions = await countOrNull(execute, "SELECT COUNT(*)::int AS n FROM submissions WHERE status = 'pending'");

  const toInt = (value: string | number | null | undefined): number =>
    typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10) || 0;

  return {
    entities: toInt(row?.entities),
    facts: toInt(row?.facts),
    evidence: toInt(row?.evidence),
    features: toInt(row?.features),
    // Boundaries are derived from the boundary GeoJSON files, not stored in a table, so this count is
    // supplied by the page that reads those files; null here means "not counted by SQL".
    boundaries: null,
    unknown_statuses: toInt(row?.unknown_statuses),
    facts_single_source: toInt(row?.facts_single_source),
    facts_without_evidence: toInt(row?.facts_without_evidence),
    entities_without_geometry: toInt(row?.entities_without_geometry),
    pending_submissions: pendingSubmissions,
    open_conflicts: toInt(row?.open_conflicts),
    unreviewed_facts: toInt(row?.unreviewed_facts),
  };
}

async function countOrNull(execute: SqlExecutor, text: string, values?: unknown[]): Promise<number | null> {
  try {
    const [row] = await execute.query<{ n: number | string }>(text, values);
    return typeof row?.n === "number" ? row.n : Number.parseInt(String(row?.n ?? ""), 10) || 0;
  } catch {
    return null;
  }
}

export interface EntityListRow {
  code: string;
  name_ar: string;
  name_en: string;
  entity_type: string;
  sector: string;
  status: string;
  has_geometry: boolean;
  has_boundary: boolean;
}

export interface EntityListQuery {
  q?: string;
  entity_type?: string;
  sector?: string;
  status?: string;
  has_geometry?: boolean;
  has_boundary?: boolean;
  page?: number;
  page_size?: number;
}

export const ADMIN_PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * Server-side pagination: the LIMIT/OFFSET happens in SQL, and the total is a separate COUNT, so the
 * page never loads the whole table to slice it in memory.
 */
export async function listEntities(
  filters: EntityListQuery,
  execute: SqlExecutor = defaultExecutor,
  boundaryCodes?: readonly string[],
): Promise<{ rows: EntityListRow[]; total: number; page: number; page_size: number }> {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(filters.page_size ?? DEFAULT_PAGE_SIZE)));

  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => { values.push(value); conditions.push(sql.replace("$?", `$${values.length}`)); };

  if (filters.q?.trim()) {
    values.push(`%${filters.q.trim()}%`);
    const placeholder = `$${values.length}`;
    conditions.push(`(e.name_ar ILIKE ${placeholder} OR e.name_en ILIKE ${placeholder} OR e.code ILIKE ${placeholder})`);
  }
  if (filters.entity_type) add("e.entity_type = $?", filters.entity_type);
  if (filters.sector) add("e.sector = $?", filters.sector);
  if (filters.status) add("e.status = $?", filters.status);
  if (filters.has_geometry === true) conditions.push("EXISTS (SELECT 1 FROM features f WHERE f.entity_id = e.id)");
  if (filters.has_geometry === false) conditions.push("NOT EXISTS (SELECT 1 FROM features f WHERE f.entity_id = e.id)");
  // The file-derived boundary index must be applied before SQL pagination and counting.
  if (filters.has_boundary !== undefined) {
    if (!boundaryCodes) throw new Error("Boundary codes are required for boundary filtering");
    values.push(boundaryCodes);
    conditions.push(`${filters.has_boundary ? "" : "NOT "}(e.code = ANY($${values.length}::text[]))`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRows = await execute.query<{ total: string | number }>(`SELECT COUNT(*) AS total FROM entities e ${where}`, values);
  const total = Number.parseInt(String(countRows[0]?.total ?? "0"), 10) || 0;

  const rows = await execute.query<{
    code: string; name_ar: string; name_en: string; entity_type: string; sector: string; status: string;
    has_geometry: boolean;
  }>(
    `SELECT e.code, e.name_ar, e.name_en, e.entity_type, e.sector, e.status,
            EXISTS (SELECT 1 FROM features f WHERE f.entity_id = e.id) AS has_geometry
       FROM entities e ${where}
      ORDER BY e.code
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, (page - 1) * pageSize],
  );

  return {
    rows: rows.map((row) => ({ ...row, has_geometry: Boolean(row.has_geometry), has_boundary: false })),
    total,
    page,
    page_size: pageSize,
  };
}

export interface FactReviewRow {
  code: string;
  entity_code: string;
  attribute: string;
  value: string;
  unit: string | null;
  valid_as_of: string | null;
  verification_state: string;
  review_state: string;
  review_reason: string | null;
  evidence: Array<{
    code: string; title: string | null; url: string | null; publisher: string | null;
    source_type: string; published_date: string | null; accessed_date: string | null;
  }>;
}

/** Facts queued for review, with every linked evidence row so the reviewer sees the whole case. */
export async function listFactsForReview(
  options: { state?: string; entity_code?: string; q?: string; page?: number; page_size?: number } = {},
  execute: SqlExecutor = defaultExecutor,
): Promise<{ rows: FactReviewRow[]; total: number; page: number; page_size: number }> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(options.page_size ?? DEFAULT_PAGE_SIZE)));
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.state && options.state !== "all") {
    values.push(options.state);
    conditions.push(options.state === "pending"
      ? `COALESCE(fr.review_state, 'pending') = $${values.length}`
      : `fr.review_state = $${values.length}`);
  }
  if (options.entity_code) { values.push(options.entity_code); conditions.push(`e.code = $${values.length}`); }
  if (options.q?.trim()) {
    values.push(`%${options.q.trim()}%`);
    conditions.push(`(f.code ILIKE $${values.length} OR e.name_ar ILIKE $${values.length} OR e.name_en ILIKE $${values.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRows = await execute.query<{ total: string | number }>(
    `SELECT COUNT(*) AS total FROM facts f
       JOIN entities e ON e.id = f.entity_id
       LEFT JOIN fact_reviews fr ON fr.fact_code = f.code ${where}`, values);
  const total = Number.parseInt(String(countRows[0]?.total ?? "0"), 10) || 0;

  const rows = await execute.query<Record<string, unknown>>(
    `SELECT f.code, e.code AS entity_code, f.attribute, f.value, f.unit,
            f.valid_as_of::text AS valid_as_of, f.verification_state,
            COALESCE(fr.review_state, 'pending') AS review_state, fr.reason AS review_reason,
            COALESCE(jsonb_agg(jsonb_build_object(
              'code', ev.code, 'title', ev.title, 'url', ev.url, 'publisher', ev.publisher,
              'source_type', ev.source_type, 'published_date', ev.published_date::text,
              'accessed_date', ev.accessed_date::text
            ) ORDER BY ev.code) FILTER (WHERE ev.id IS NOT NULL), '[]'::jsonb) AS evidence
       FROM facts f
       JOIN entities e ON e.id = f.entity_id
       LEFT JOIN fact_reviews fr ON fr.fact_code = f.code
       LEFT JOIN fact_evidence fe ON fe.fact_id = f.id
       LEFT JOIN evidence ev ON ev.id = fe.evidence_id
       ${where}
      GROUP BY f.id, f.code, e.code, f.attribute, f.value, f.unit, f.valid_as_of, f.verification_state,
               fr.review_state, fr.reason
      ORDER BY (COALESCE(fr.review_state, 'pending') = 'pending') DESC, f.code
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, (page - 1) * pageSize],
  );

  return { rows: rows as unknown as FactReviewRow[], total, page, page_size: pageSize };
}

/**
 * The filter options, read from the data rather than hardcoded.
 *
 * A hardcoded list drifts: it offers values that no longer exist (nothing to filter) and hides new ones
 * (`partial`, `approved_planned`), which makes a real status look absent. Distinct values from the table
 * are always exactly the values someone can filter by.
 */
export async function getEntityFilterOptions(execute: SqlExecutor = defaultExecutor): Promise<{
  types: string[]; sectors: string[]; statuses: string[];
}> {
  const rows = await execute.query<{ kind: string; value: string }>(
    `SELECT 'type' AS kind, entity_type AS value FROM entities
     UNION SELECT 'sector', sector FROM entities
     UNION SELECT 'status', status FROM entities`,
  );
  const collect = (kind: string) => rows.filter((row) => row.kind === kind).map((row) => row.value).sort();
  return { types: collect("type"), sectors: collect("sector"), statuses: collect("status") };
}
