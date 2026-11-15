import { describe, expect, it } from "vitest";
import {
  decideFactReview, detectDuplicates, evidenceSupportsVerification, factMayBeVerified,
  reviewRequestSchema, REVIEW_STATE_LABELS,
} from "@/lib/admin/review";

const evidence = (overrides: Partial<{ code: string; source_type: string; url: string | null }> = {}) => ({
  code: "EV-1", source_type: "official", url: "https://example.gov.eg/report", ...overrides,
});

const fact = (overrides: Partial<{ evidence_codes: string[]; verification_state: string }> = {}) => ({
  code: "F-1", entity_code: "CITY-OBOUR", attribute: "operational_status", value: "operational",
  verification_state: "candidate", evidence_codes: ["EV-1"], ...overrides,
});

const mapOf = (rows: Array<ReturnType<typeof evidence>>) => new Map(rows.map((row) => [row.code, row]));

describe("BATCH 13 — verified still means official evidence with a URL", () => {
  it("accepts only an official source with a non-empty URL", () => {
    expect(evidenceSupportsVerification(evidence())).toBe(true);
    expect(evidenceSupportsVerification(evidence({ url: null }))).toBe(false);
    expect(evidenceSupportsVerification(evidence({ url: "   " }))).toBe(false);
    expect(evidenceSupportsVerification(evidence({ source_type: "media" }))).toBe(false);
    expect(evidenceSupportsVerification(evidence({ source_type: "secondary" }))).toBe(false);
    expect(evidenceSupportsVerification(undefined)).toBe(false);
  });

  it("refuses to verify a fact with no evidence at all", () => {
    expect(factMayBeVerified(fact({ evidence_codes: [] }), mapOf([evidence()]))).toBe(false);
    // One good source among several is enough; a single bad one is not.
    expect(factMayBeVerified(fact({ evidence_codes: ["EV-1", "EV-2"] }), mapOf([evidence(), evidence({ code: "EV-2", url: null })]))).toBe(true);
    expect(factMayBeVerified(fact({ evidence_codes: ["EV-2"] }), mapOf([evidence({ code: "EV-2", url: null })]))).toBe(false);
  });

  it("approving a well-sourced fact marks it verified", () => {
    const outcome = decideFactReview(fact(), mapOf([evidence()]), { action: "approve" });
    expect(outcome.next_review_state).toBe("approved");
    expect(outcome.next_verification_state).toBe("verified");
    expect(outcome.verification_unchanged_reason).toBeNull();
    expect(outcome.audit.action).toBe("fact.approve");
    expect(outcome.audit.before_state).toMatchObject({ review_state: "pending", verification_state: "candidate" });
    expect(outcome.audit.after_state).toMatchObject({ review_state: "approved", verification_state: "verified" });
  });

  it("approving a fact with no official URL approves the review but does NOT verify the claim", () => {
    const outcome = decideFactReview(fact(), mapOf([evidence({ url: null })]), { action: "approve" });
    expect(outcome.next_review_state).toBe("approved");
    // The important assertion: the claim is not silently upgraded.
    expect(outcome.next_verification_state).toBe("candidate");
    expect(outcome.next_verification_state).not.toBe("verified");
    expect(outcome.verification_unchanged_reason).toContain("no linked evidence is an official source with a URL");
  });

  it("never downgrades an already-verified fact on approval", () => {
    const outcome = decideFactReview(fact({ verification_state: "verified" }), mapOf([evidence({ url: null })]), { action: "approve" });
    expect(outcome.next_verification_state).toBe("verified");
  });
});

describe("BATCH 13 — review actions never destroy data and always record why", () => {
  it("requires a reason for reject and dispute, and trims it", () => {
    expect(reviewRequestSchema.safeParse({ action: "reject" }).success).toBe(false);
    expect(reviewRequestSchema.safeParse({ action: "dispute" }).success).toBe(false);
    expect(reviewRequestSchema.safeParse({ action: "reject", reason: "  " }).success).toBe(false);
    expect(reviewRequestSchema.safeParse({ action: "approve" }).success).toBe(true);
    const parsed = reviewRequestSchema.parse({ action: "reject", reason: "  the source says otherwise  " });
    expect(parsed.reason).toBe("the source says otherwise");
  });

  it("rejection keeps the claim and its evidence intact", () => {
    const outcome = decideFactReview(fact(), mapOf([evidence()]), { action: "reject", reason: "superseded by a 2026 decree" });
    expect(outcome.next_review_state).toBe("rejected");
    // Rejecting a review must not erase the fact or its evidence.
    expect(outcome.next_verification_state).toBe("candidate");
    expect(outcome.audit.after_state.evidence_codes).toEqual(["EV-1"]);
    expect(outcome.audit.reason).toBe("superseded by a 2026 decree");
  });

  it("dispute sets the claim disputed and carries the reason", () => {
    const outcome = decideFactReview(fact(), mapOf([evidence()]), { action: "dispute", reason: "two sources disagree" });
    expect(outcome.next_review_state).toBe("disputed");
    expect(outcome.next_verification_state).toBe("disputed");
    expect(outcome.audit.action).toBe("fact.dispute");
    expect(outcome.audit.reason).toBe("two sources disagree");
  });

  it("reset returns to pending without inventing a verification change", () => {
    const outcome = decideFactReview(fact({ verification_state: "disputed" }), mapOf([evidence()]), { action: "reset" }, "disputed");
    expect(outcome.next_review_state).toBe("pending");
    expect(outcome.next_verification_state).toBe("disputed");
    expect(outcome.audit.before_state.review_state).toBe("disputed");
  });

  it("labels every review state in both languages", () => {
    for (const state of ["pending", "approved", "rejected", "disputed"] as const) {
      expect(REVIEW_STATE_LABELS[state].ar.length).toBeGreaterThan(0);
      expect(REVIEW_STATE_LABELS[state].en.length).toBeGreaterThan(0);
    }
  });
});

describe("BATCH 13 — import duplicate detection", () => {
  const existing = [
    { code: "CITY-6-OCTOBER", name_ar: "6 أكتوبر", name_en: "6th of October", aliases: ["أكتوبر", "مدينة السادس من أكتوبر"] },
    { code: "CITY-OBOUR", name_ar: "العبور", name_en: "El Obour", aliases: [] },
    { code: "STOP-LRT-OBOUR", name_ar: "العبور", name_en: "El Obour", aliases: [] },
  ];

  it("detects an exact code collision", () => {
    const matches = detectDuplicates([{ code: "CITY-OBOUR", name_ar: "شيء آخر", name_en: "Something else" }], existing);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ match_type: "code", existing_code: "CITY-OBOUR" });
  });

  it("detects a collision after Arabic orthographic normalisation", () => {
    // «العبـور» with a tatweel and a different alef form is the same name to a reader.
    const matches = detectDuplicates([{ code: "CITY-NEW", name_ar: "العبـور", name_en: "Unrelated" }], existing);
    expect(matches.map((match) => match.match_type)).toContain("normalised_name_ar");
    expect(matches.map((match) => match.existing_code)).toEqual(expect.arrayContaining(["CITY-OBOUR", "STOP-LRT-OBOUR"]));
  });

  it("detects an alias that is already attached to another entity", () => {
    const matches = detectDuplicates([{ code: "CITY-NEW", name_ar: "مدينة جديدة", name_en: "Brand New", aliases: ["أكتوبر"] }], existing);
    expect(matches.map((match) => match.match_type)).toContain("alias");
    expect(matches.find((match) => match.match_type === "alias")!.existing_code).toBe("CITY-6-OCTOBER");
  });

  it("reports nothing for a genuinely new entity", () => {
    expect(detectDuplicates([{ code: "CITY-BRAND-NEW", name_ar: "مدينة فريدة", name_en: "Unique City" }], existing)).toHaveLength(0);
  });
});
