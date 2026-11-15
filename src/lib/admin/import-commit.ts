import type { ImportPlan } from "./import-pipeline";
import type { SqlExecutor } from "./queries";

/**
 * BATCH 13 — apply an approved import plan.
 *
 * The plan is the only input, and `actionable` is what a commit is allowed to touch: rows the planner
 * rejected, marked unchanged or flagged as conflicts are not present there, so a bug here cannot
 * silently insert something the reviewer never saw.
 *
 * Ordering matters. Evidence is inserted before facts because a fact references its evidence, and facts
 * after entities because a fact belongs to an entity. A fact whose entity is missing is skipped rather
 * than inserted against a wrong id: the FK is resolved by code, never guessed.
 *
 * Facts always land as `candidate`. An import is a proposal, not a review.
 */
export interface ImportCommitResult {
  entities: number;
  facts: number;
  evidence: number;
  /** Facts whose evidence did not exist after all, so the link could not be made. */
  skipped_fact_links: number;
}

export async function commitImportPlan(execute: SqlExecutor, plan: ImportPlan): Promise<ImportCommitResult> {
  const result: ImportCommitResult = { entities: 0, facts: 0, evidence: 0, skipped_fact_links: 0 };

  for (const row of plan.actionable.evidence) {
    const inserted = await execute.query<{ code: string }>(
      `INSERT INTO evidence (code, title, url, publisher, source_type, published_date, accessed_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, CURRENT_DATE),$8)
       ON CONFLICT (code) DO NOTHING
       RETURNING code`,
      [row.code, row.title, row.url ?? null, row.publisher ?? null, row.source_type,
        row.published_date ?? null, row.accessed_date ?? null, row.notes ?? null]);
    result.evidence += inserted.length;
  }

  for (const row of plan.actionable.entities) {
    const inserted = await execute.query<{ code: string }>(
      `INSERT INTO entities (code, name_ar, name_en, entity_type, sector, status, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (code) DO NOTHING
       RETURNING code`,
      [row.code, row.name_ar, row.name_en, row.entity_type, row.sector, row.status, row.description || null]);
    result.entities += inserted.length;
  }

  for (const row of plan.actionable.facts) {
    const inserted = await execute.query<{ code: string }>(
      `INSERT INTO facts (code, entity_id, attribute, value, unit, valid_as_of, verification_state, notes)
       SELECT $1, e.id, $3, $4, $5, $6::date, 'candidate', $7 FROM entities e WHERE e.code = $2
       ON CONFLICT (code) DO NOTHING
       RETURNING code`,
      [row.code, row.entity_code, row.attribute, row.value, row.unit ?? null, row.valid_as_of ?? null, row.notes ?? null]);
    if (inserted.length === 0) continue;
    result.facts += 1;

    for (const evidenceCode of row.evidence_codes) {
      const linked = await execute.query<{ fact_id: string }>(
        `INSERT INTO fact_evidence (fact_id, evidence_id)
         SELECT f.id, ev.id FROM facts f, evidence ev WHERE f.code = $1 AND ev.code = $2
         ON CONFLICT DO NOTHING
         RETURNING fact_id`, [row.code, evidenceCode]);
      if (linked.length === 0) result.skipped_fact_links += 1;
    }
  }

  return result;
}
