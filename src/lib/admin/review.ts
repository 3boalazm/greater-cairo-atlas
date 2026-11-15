import { z } from "zod";

/**
 * BATCH 13 — fact review actions.
 *
 * Rules this module enforces, regardless of what the UI sends:
 *   1. Nothing is deleted or overwritten. A decision writes a `fact_reviews` row and an audit row.
 *   2. `verified` still means an official evidence row with a non-empty URL (migration 008). An
 *      approval of a fact whose evidence does not meet that bar keeps the fact `candidate` and says
 *      so, instead of quietly upgrading the claim.
 *   3. Reject and dispute require a written reason.
 */

export const FACT_REVIEW_STATES = ["pending", "approved", "rejected", "disputed"] as const;
export type FactReviewState = (typeof FACT_REVIEW_STATES)[number];

export const REVIEW_ACTIONS = ["approve", "reject", "dispute", "reset"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const reviewRequestSchema = z.strictObject({
  action: z.enum(REVIEW_ACTIONS),
  reason: z.string().trim().min(1).max(2000).optional(),
  /** The review state the caller believes the fact is in, to catch two reviewers racing. */
  expected_state: z.enum(FACT_REVIEW_STATES).optional(),
}).superRefine((value, ctx) => {
  if ((value.action === "reject" || value.action === "dispute") && !value.reason) {
    ctx.addIssue({ code: "custom", path: ["reason"], message: `A written reason is required to ${value.action} a fact.` });
  }
});

export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

/** The subset of an evidence row that decides whether a fact may be called verified. */
export interface EvidenceFacts {
  code: string;
  source_type: string;
  url: string | null;
}

export interface ReviewFactInput {
  code: string;
  entity_code: string;
  attribute: string;
  value: string;
  verification_state: string;
  evidence_codes: readonly string[];
}

/** Migration 008's rule, in one place: official source AND a non-empty URL. */
export function evidenceSupportsVerification(evidence: EvidenceFacts | undefined | null): boolean {
  if (!evidence) return false;
  return evidence.source_type === "official" && typeof evidence.url === "string" && evidence.url.trim().length > 0;
}

export function factMayBeVerified(fact: Pick<ReviewFactInput, "evidence_codes">, evidenceByCode: ReadonlyMap<string, EvidenceFacts>): boolean {
  if (fact.evidence_codes.length === 0) return false;
  return fact.evidence_codes.some((code) => evidenceSupportsVerification(evidenceByCode.get(code)));
}

export interface ReviewOutcome {
  action: ReviewAction;
  next_review_state: FactReviewState;
  /** What `verification_state` becomes. Unchanged unless the approval is actually backed. */
  next_verification_state: string;
  verification_unchanged_reason: string | null;
  audit: {
    action: "fact.approve" | "fact.reject" | "fact.dispute" | "fact.reset";
    before_state: Record<string, unknown>;
    after_state: Record<string, unknown>;
    reason: string | null;
  };
}

/**
 * Pure decision function: given the fact, its evidence and the requested action, decide the next
 * state and build the audit payload. Nothing here touches a database, so the rules can be tested
 * exhaustively.
 */
export function decideFactReview(
  fact: ReviewFactInput,
  evidenceByCode: ReadonlyMap<string, EvidenceFacts>,
  request: ReviewRequest,
  currentReviewState: FactReviewState = "pending",
): ReviewOutcome {
  const mayVerify = factMayBeVerified(fact, evidenceByCode);
  const beforeState = {
    review_state: currentReviewState,
    verification_state: fact.verification_state,
    evidence_codes: [...fact.evidence_codes],
  };

  const build = (
    nextReview: FactReviewState,
    nextVerification: string,
    unchangedReason: string | null,
    action: ReviewOutcome["audit"]["action"],
  ): ReviewOutcome => ({
    action: request.action,
    next_review_state: nextReview,
    next_verification_state: nextVerification,
    verification_unchanged_reason: unchangedReason,
    audit: {
      action,
      before_state: beforeState,
      after_state: { review_state: nextReview, verification_state: nextVerification, evidence_codes: [...fact.evidence_codes] },
      reason: request.reason ?? null,
    },
  });

  switch (request.action) {
    case "approve":
      // Approval is a human review decision, not a verification. It only promotes a claim when the
      // evidence actually satisfies migration 008; otherwise the claim stays a candidate and the
      // reviewer is told why.
      return mayVerify
        ? build("approved", "verified", null, "fact.approve")
        : build("approved", fact.verification_state === "verified" ? "verified" : "candidate",
          "approved, but not marked verified: no linked evidence is an official source with a URL", "fact.approve");
    case "reject":
      // Rejection never deletes the claim; it records that a human refused it.
      return build("rejected", fact.verification_state, null, "fact.reject");
    case "dispute":
      return build("disputed", "disputed", null, "fact.dispute");
    case "reset":
      return build("pending", fact.verification_state, null, "fact.reset");
  }
}

/** Human-readable Arabic/English label for the review state, used by the admin UI. */
export const REVIEW_STATE_LABELS: Record<FactReviewState, { ar: string; en: string }> = {
  pending: { ar: "بانتظار المراجعة", en: "Pending review" },
  approved: { ar: "معتمدة", en: "Approved" },
  rejected: { ar: "مرفوضة", en: "Rejected" },
  disputed: { ar: "متنازع عليها", en: "Disputed" },
};

/**
 * Duplicate detection for the import pipeline: by exact code, by normalised Arabic name, and by
 * alias. Returns every existing entity the incoming row would collide with.
 */
export interface DuplicateCandidate {
  code: string;
  name_ar: string;
  name_en: string;
  aliases: readonly string[];
}

export interface IncomingRow {
  code: string;
  name_ar: string;
  name_en: string;
  aliases?: readonly string[];
}

export interface DuplicateMatch {
  match_type: "code" | "normalised_name_ar" | "normalised_name_en" | "alias";
  incoming: IncomingRow;
  existing_code: string;
  detail: string;
}

export function normalizeArabicName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0640\u200c\u200d\u00a0]/gu, "")
    .replace(/[\u064b-\u0652]/gu, "")
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export function detectDuplicates(
  incoming: readonly IncomingRow[],
  existing: readonly DuplicateCandidate[],
): DuplicateMatch[] {
  const byCode = new Map(existing.map((entity) => [entity.code, entity]));
  const byNameAr = new Map<string, DuplicateCandidate[]>();
  const byNameEn = new Map<string, DuplicateCandidate[]>();
  const byAlias = new Map<string, DuplicateCandidate[]>();
  const push = (map: Map<string, DuplicateCandidate[]>, key: string, entity: DuplicateCandidate) => {
    if (!key) return;
    map.set(key, [...(map.get(key) ?? []), entity]);
  };
  for (const entity of existing) {
    push(byNameAr, normalizeArabicName(entity.name_ar), entity);
    push(byNameEn, normalizeArabicName(entity.name_en), entity);
    for (const alias of entity.aliases) push(byAlias, normalizeArabicName(alias), entity);
  }

  const matches: DuplicateMatch[] = [];
  for (const row of incoming) {
    const exact = byCode.get(row.code);
    if (exact) {
      matches.push({ match_type: "code", incoming: row, existing_code: exact.code, detail: `Entity code ${row.code} already exists.` });
      // A code match already identifies the row; name checks would only add noise.
      continue;
    }
    const nameAr = normalizeArabicName(row.name_ar);
    const nameEn = normalizeArabicName(row.name_en);
    for (const entity of byNameAr.get(nameAr) ?? []) {
      if (entity.code === row.code) continue;
      matches.push({ match_type: "normalised_name_ar", incoming: row, existing_code: entity.code, detail: `Arabic name «${row.name_ar}» matches ${entity.code}.` });
    }
    for (const entity of byNameEn.get(nameEn) ?? []) {
      if (entity.code === row.code) continue;
      matches.push({ match_type: "normalised_name_en", incoming: row, existing_code: entity.code, detail: `English name «${row.name_en}» matches ${entity.code}.` });
    }
    for (const alias of row.aliases ?? []) {
      for (const entity of byAlias.get(normalizeArabicName(alias)) ?? []) {
        if (entity.code === row.code) continue;
        matches.push({ match_type: "alias", incoming: row, existing_code: entity.code, detail: `Alias «${alias}» is already attached to ${entity.code}.` });
      }
    }
  }
  return matches;
}
