import { z } from "zod";
import { RequestValidationError } from "@/lib/errors";
import {
  decideFactReview, reviewRequestSchema, type EvidenceFacts, type FactReviewState, type ReviewFactInput,
} from "./review";
import type { SqlExecutor } from "./queries";

/**
 * BATCH 13 — write operations for the admin workspace.
 *
 * Every function here writes the data change AND its audit row inside one transaction, so a crash
 * cannot leave a decision without its history. Nothing issues a DELETE; the only destructive-looking
 * operation (attaching evidence) is an insert.
 */
export interface AdminWriteContext {
  actor: string;
  token_fingerprint: string;
}

export interface TransactionalExecutor extends SqlExecutor {
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

async function inTransaction<T>(execute: TransactionalExecutor, work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
  if (execute.transaction) return execute.transaction(work);
  return work(execute);
}

export interface FactStateRow {
  code: string;
  entity_code: string;
  attribute: string;
  value: string;
  verification_state: string;
}

function asFactInput(row: FactStateRow, evidenceCodes: readonly string[]): ReviewFactInput {
  return {
    code: row.code, entity_code: row.entity_code, attribute: row.attribute, value: row.value,
    verification_state: row.verification_state, evidence_codes: evidenceCodes,
  };
}

export interface ReviewMutationResult {
  fact_code: string;
  review_state: FactReviewState;
  verification_state: string;
  verification_unchanged_reason: string | null;
  audit_id: string | number;
}

/**
 * Applies a review decision to one fact.
 *
 * The expected_state check is optimistic concurrency: if another reviewer already decided, the request
 * is refused with the current state instead of silently overwriting their decision.
 */
export async function applyFactReview(
  execute: TransactionalExecutor,
  context: AdminWriteContext,
  factCode: string,
  rawBody: unknown,
): Promise<ReviewMutationResult> {
  const parsed = reviewRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const missingReason = parsed.error.issues.some((issue) => issue.path.join(".") === "reason");
    throw new RequestValidationError(
      missingReason ? "A written reason is required for this action." : "Invalid review request.",
      parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "body", message: issue.message })),
    );
  }
  const request = parsed.data;

  return inTransaction(execute, async (tx) => {
    const [factRow] = await tx.query<FactStateRow>(`
      SELECT f.code, e.code AS entity_code, f.attribute, f.value, f.verification_state
        FROM facts f JOIN entities e ON e.id = f.entity_id
       WHERE f.code = $1
       LIMIT 1`, [factCode]);
    if (!factRow) throw new RequestValidationError("Unknown fact code.", [{ path: "fact", message: `No fact with code ${factCode}.` }]);

    const evidenceRows = await tx.query<EvidenceFacts & { title: string | null; publisher: string | null }>(`
      SELECT ev.code, ev.source_type, ev.url, ev.title, ev.publisher
        FROM fact_evidence fe JOIN evidence ev ON ev.id = fe.evidence_id
       WHERE fe.fact_id = (SELECT id FROM facts WHERE code = $1)
       ORDER BY ev.code`, [factCode]);
    const evidenceByCode = new Map(evidenceRows.map((row) => [row.code, row]));

    const [currentReview] = await tx.query<{ review_state: FactReviewState; reason: string | null }>(
      "SELECT review_state, reason FROM fact_reviews WHERE fact_code = $1", [factCode]);
    const currentState: FactReviewState = currentReview?.review_state ?? "pending";

    if (request.expected_state && request.expected_state !== currentState) {
      throw new RequestValidationError("Someone else already reviewed this fact.", [{
        path: "expected_state",
        message: `Expected ${request.expected_state} but the fact is currently ${currentState}. Reload before deciding.`,
      }]);
    }

    const outcome = decideFactReview(
      asFactInput(factRow, evidenceRows.map((row) => row.code)),
      evidenceByCode,
      request,
      currentState,
    );

    // Review state: upsert on the fact code. The previous state lives on in the audit log.
    await tx.query(`
      INSERT INTO fact_reviews (fact_code, review_state, reason, reviewer, reviewed_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (fact_code) DO UPDATE
        SET review_state = EXCLUDED.review_state, reason = EXCLUDED.reason,
            reviewer = EXCLUDED.reviewer, reviewed_at = NOW(), updated_at = NOW()`,
      [factCode, outcome.next_review_state, outcome.audit.reason, context.actor]);

    // verification_state only moves when the decision says it should.
    if (outcome.next_verification_state !== factRow.verification_state) {
      await tx.query("UPDATE facts SET verification_state = $2, updated_at = NOW() WHERE code = $1",
        [factCode, outcome.next_verification_state]);
    }

    const [auditRow] = await tx.query<{ id: string | number }>(`
      INSERT INTO admin_audit_log
        (actor, action, entity_code, fact_code, reason, before_state, after_state, request_fingerprint)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
      RETURNING id`,
      [context.actor, outcome.audit.action, factRow.entity_code, factCode, outcome.audit.reason,
        JSON.stringify(outcome.audit.before_state), JSON.stringify(outcome.audit.after_state), context.token_fingerprint]);

    return {
      fact_code: factCode,
      review_state: outcome.next_review_state,
      verification_state: outcome.next_verification_state,
      verification_unchanged_reason: outcome.verification_unchanged_reason,
      audit_id: auditRow!.id,
    };
  });
}

export const attachEvidenceSchema = z.strictObject({
  /** `supporting` confirms the claim; `contradicting` is recorded as a dispute, never as a silent edit. */
  stance: z.enum(["supporting", "contradicting"]),
  evidence_code: z.string().min(1).max(120),
  reason: z.string().trim().min(1).max(2000),
});

/**
 * Attaches existing evidence to a fact. Contradicting evidence moves the review to `disputed` — it does
 * not delete or overwrite the claim, because a contradiction is a fact about the record, not a verdict.
 */
export async function attachEvidence(
  execute: TransactionalExecutor,
  context: AdminWriteContext,
  factCode: string,
  rawBody: unknown,
): Promise<{ fact_code: string; review_state: FactReviewState; audit_id: string | number }> {
  const parsed = attachEvidenceSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new RequestValidationError("Invalid evidence attachment.", parsed.error.issues.map((issue) => ({
      path: issue.path.join(".") || "body", message: issue.message,
    })));
  }
  const { stance, evidence_code: evidenceCode, reason } = parsed.data;

  return inTransaction(execute, async (tx) => {
    const [factRow] = await tx.query<FactStateRow>(`
      SELECT f.code, e.code AS entity_code, f.attribute, f.value, f.verification_state
        FROM facts f JOIN entities e ON e.id = f.entity_id WHERE f.code = $1 LIMIT 1`, [factCode]);
    if (!factRow) throw new RequestValidationError("Unknown fact code.", [{ path: "fact", message: `No fact with code ${factCode}.` }]);

    const [evidenceRow] = await tx.query<EvidenceFacts & { title: string | null }>(
      "SELECT code, source_type, url, title FROM evidence WHERE code = $1 LIMIT 1", [evidenceCode]);
    if (!evidenceRow) throw new RequestValidationError("Unknown evidence code.", [{ path: "evidence", message: `No evidence with code ${evidenceCode}.` }]);

    const [current] = await tx.query<{ review_state: FactReviewState }>(
      "SELECT review_state FROM fact_reviews WHERE fact_code = $1", [factCode]);
    const currentState: FactReviewState = current?.review_state ?? "pending";

    // Already linked: the write is a no-op for the link itself, but the decision is still recorded.
    await tx.query(`
      INSERT INTO fact_evidence (fact_id, evidence_id)
      SELECT f.id, e.id FROM facts f, evidence e WHERE f.code = $1 AND e.code = $2
      ON CONFLICT DO NOTHING`, [factCode, evidenceCode]);

    const nextState: FactReviewState = stance === "contradicting" ? "disputed" : currentState;
    if (nextState !== currentState) {
      await tx.query(`
        INSERT INTO fact_reviews (fact_code, review_state, reason, reviewer, reviewed_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (fact_code) DO UPDATE
          SET review_state = EXCLUDED.review_state, reason = EXCLUDED.reason,
              reviewer = EXCLUDED.reviewer, reviewed_at = NOW(), updated_at = NOW()`,
        [factCode, nextState, reason, context.actor]);
      await tx.query("UPDATE facts SET verification_state = 'disputed', updated_at = NOW() WHERE code = $1", [factCode]);
    }

    const [auditRow] = await tx.query<{ id: string | number }>(`
      INSERT INTO admin_audit_log
        (actor, action, entity_code, fact_code, evidence_code, reason, before_state, after_state, request_fingerprint)
      VALUES ($1, 'evidence.attach', $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
      RETURNING id`,
      [context.actor, factRow.entity_code, factCode, evidenceCode, reason,
        JSON.stringify({ review_state: currentState }),
        JSON.stringify({
          review_state: nextState, stance, evidence: {
            code: evidenceRow.code, source_type: evidenceRow.source_type, url: evidenceRow.url, title: evidenceRow.title,
          },
        }), context.token_fingerprint]);

    return { fact_code: factCode, review_state: nextState, audit_id: auditRow!.id };
  });
}

/**
 * Accepts a community submission as a *candidate* fact with its evidence. It can never create a
 * verified fact: the source is whatever URL the submitter gave, which has not been checked officially.
 */
export async function acceptSubmission(
  execute: TransactionalExecutor,
  context: AdminWriteContext,
  submissionId: string,
): Promise<{ fact_code: string; submission_id: string; audit_id: string | number; verification_state: "candidate" }> {
  return inTransaction(execute, async (tx) => {
    const [submission] = await tx.query<{
      id: string; entity_code: string; attribute: string; proposed_value: string; source_url: string; status: string;
    }>("SELECT id, entity_code, attribute, proposed_value, source_url, status FROM submissions WHERE id = $1 LIMIT 1", [submissionId]);
    if (!submission) throw new RequestValidationError("Unknown submission.", [{ path: "submission", message: `No submission with id ${submissionId}.` }]);
    if (submission.status !== "pending") {
      throw new RequestValidationError("This submission was already reviewed.", [{ path: "submission", message: `Submission is ${submission.status}.` }]);
    }

    // Deterministic codes so re-accepting cannot create duplicates, and so the provenance is obvious.
    const evidenceCode = `EV-SUB-${submission.id.slice(0, 8).toUpperCase()}`;
    const factCode = `F-${submission.entity_code}-${submission.attribute.toUpperCase().replace(/[^A-Z0-9]+/gu, "-")}-SUB`;

    await tx.query(`
      INSERT INTO evidence (code, title, url, publisher, source_type, accessed_date, notes)
      VALUES ($1, $2, $3, 'Community submission', 'secondary', CURRENT_DATE, $4)
      ON CONFLICT (code) DO NOTHING`,
      [evidenceCode, `Community submission for ${submission.attribute}`, submission.source_url, "Submitted through the public form; not independently verified."]);

    await tx.query(`
      INSERT INTO facts (code, entity_id, attribute, value, verification_state, notes)
      SELECT $1, id, $3, $4, 'candidate', $5 FROM entities WHERE code = $2
      ON CONFLICT (code) DO NOTHING`,
      [factCode, submission.entity_code, submission.attribute, submission.proposed_value,
        `Created from community submission ${submission.id}. Candidate only.`]);

    await tx.query(`
      INSERT INTO fact_evidence (fact_id, evidence_id)
      SELECT f.id, e.id FROM facts f, evidence e WHERE f.code = $1 AND e.code = $2
      ON CONFLICT DO NOTHING`, [factCode, evidenceCode]);

    await tx.query("UPDATE submissions SET status = 'accepted', updated_at = NOW() WHERE id = $1", [submissionId]);

    const [auditRow] = await tx.query<{ id: string | number }>(`
      INSERT INTO admin_audit_log
        (actor, action, entity_code, fact_code, evidence_code, submission_id, before_state, after_state, request_fingerprint)
      VALUES ($1, 'submission.accept', $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
      RETURNING id`,
      [context.actor, submission.entity_code, factCode, evidenceCode, submissionId,
        JSON.stringify({ submission_status: "pending" }),
        JSON.stringify({ submission_status: "accepted", fact_code: factCode, verification_state: "candidate" }),
        context.token_fingerprint]);

    return { fact_code: factCode, submission_id: submissionId, audit_id: auditRow!.id, verification_state: "candidate" };
  });
}

export async function rejectSubmission(
  execute: TransactionalExecutor,
  context: AdminWriteContext,
  submissionId: string,
  rawBody: unknown,
): Promise<{ submission_id: string; audit_id: string | number }> {
  const parsed = z.strictObject({ reason: z.string().trim().min(1).max(1000) }).safeParse(rawBody);
  if (!parsed.success) {
    throw new RequestValidationError("A reason is required to reject a submission.", parsed.error.issues.map((issue) => ({
      path: issue.path.join(".") || "body", message: issue.message,
    })));
  }
  return inTransaction(execute, async (tx) => {
    const [submission] = await tx.query<{ id: string; entity_code: string; status: string }>(
      "SELECT id, entity_code, status FROM submissions WHERE id = $1 LIMIT 1", [submissionId]);
    if (!submission) throw new RequestValidationError("Unknown submission.", [{ path: "submission", message: `No submission with id ${submissionId}.` }]);
    if (submission.status !== "pending") {
      throw new RequestValidationError("This submission was already reviewed.", [{ path: "submission", message: `Submission is ${submission.status}.` }]);
    }
    await tx.query("UPDATE submissions SET status = 'rejected', reviewer_note = $2, updated_at = NOW() WHERE id = $1",
      [submissionId, parsed.data.reason]);
    const [auditRow] = await tx.query<{ id: string | number }>(`
      INSERT INTO admin_audit_log
        (actor, action, entity_code, submission_id, reason, before_state, after_state, request_fingerprint)
      VALUES ($1, 'submission.reject', $2, $3, $4, $5::jsonb, $6::jsonb, $7)
      RETURNING id`,
      [context.actor, submission.entity_code, submissionId, parsed.data.reason,
        JSON.stringify({ submission_status: "pending" }), JSON.stringify({ submission_status: "rejected" }),
        context.token_fingerprint]);
    return { submission_id: submissionId, audit_id: auditRow!.id };
  });
}

export interface AuditRow {
  id: string | number;
  occurred_at: string;
  actor: string;
  action: string;
  entity_code: string | null;
  fact_code: string | null;
  evidence_code: string | null;
  reason: string | null;
  before_state: unknown;
  after_state: unknown;
}

export async function listAuditRows(
  execute: SqlExecutor,
  options: { entity_code?: string; fact_code?: string; limit?: number } = {},
): Promise<AuditRow[]> {
  const limit = Math.min(200, Math.max(1, Math.trunc(options.limit ?? 50)));
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.entity_code) { values.push(options.entity_code); conditions.push(`entity_code = $${values.length}`); }
  if (options.fact_code) { values.push(options.fact_code); conditions.push(`fact_code = $${values.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return execute.query<AuditRow>(
    `SELECT id, occurred_at::text AS occurred_at, actor, action, entity_code, fact_code, evidence_code, reason, before_state, after_state
       FROM admin_audit_log ${where} ORDER BY occurred_at DESC, id DESC LIMIT $${values.length + 1}`,
    [...values, limit]);
}
