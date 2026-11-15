import { ENTITY_STATUSES, type EntityStatus, type FactVerificationState } from "@/lib/atlas/schema";

/**
 * BATCH 14.1 — «الحالة في تاريخ»: what did the atlas know about an entity in a given year?
 *
 * ## What this is allowed to use, and why it is narrower than it looks
 *
 * The only admissible input is a *dated status assertion*: an `operational_status` fact whose
 * `valid_as_of` says when that status was true. That is the whole vocabulary. Nothing here infers a
 * transition from an opening date, from a phase schedule, or from the fact that a later status exists.
 *
 * In particular the seed's `opening` facts are **not** usable as a status source. Their `valid_as_of` is
 * the date the claim was recorded (mostly 2026-11-14), while the opening date itself sits in the free-text
 * `value` — sometimes as prose («المترو أغسطس 2020؛ LRT ومجمع النقل يوليو 2022»). Parsing that text would
 * be guessing, and a guess is exactly what this feature must not do. They remain a research aid in the
 * panel, never an input to a rendered status.
 *
 * ## Why "today" can differ from the entity's stored status
 *
 * The map draws `entities.status`, a curated column. This resolver answers a narrower question — "what is
 * the latest dated status claim on or before this year?" — so where the two disagree it is because a dated
 * claim exists that the curated column does not follow (or a claim is marked disputed). That is reported,
 * not smoothed over: the UI says how many entities are dated and how many are unknown at the chosen year,
 * and the researcher panel shows the deciding fact. Any disagreement is a finding for the data review, not
 * something to be hidden by making the resolver copy the column.
 */

/**
 * The weakest verification state that may determine what the map *draws*.
 *
 * `candidate` means nobody has reviewed the claim yet. Letting an unreviewed row repaint the map is how a
 * timeline starts contradicting the published dataset in public — measured on the seed, 16 of 18
 * disagreements with the curated column came from a candidate-only claim. So a candidate may still be
 * reported as context (the panel shows it), but it does not get to change a colour.
 *
 * `corroborated` or better is required. This is the same bar the rest of the codebase already uses when it
 * ranks sources, not a new threshold invented for this feature.
 */
const DRAWABLE_STATES: ReadonlySet<FactVerificationState> = new Set(["verified", "corroborated"]);

export interface TimelineStatusFact {
  entity_code: string;
  attribute: string;
  value: string;
  valid_as_of: string;
  valid_as_of_precision: "day" | "month" | "year";
  verification_state: FactVerificationState;
  fact_code: string;
  /** Present only when a claim is explicitly unbounded; the seed has none, but the resolver honours it. */
  valid_to?: string | null;
}

/** `unknown` is not an entity status: it is this resolver's word for "no dated claim said anything". */
export type TimelineResolvedStatus = EntityStatus;

export interface TimelineStatusResolution {
  /** The status the map may draw. `unknown` means no drawing-grade dated claim exists for the year. */
  status: TimelineResolvedStatus;
  /**
   * The status the panel may *report* even when it is not drawing-grade — e.g. an unreviewed candidate.
   * Null when nothing beyond `status` is worth saying.
   */
  reported_status: EntityStatus | null;
  /** Why a reported claim was not allowed to colour the map. Null when it was. */
  not_drawn_reason: "unreviewed" | null;
  /** False when the entity had no dated claim at all at this year (drawn as «غير معروف في هذا التاريخ»). */
  dated: boolean;
  verification_state: FactVerificationState | "conflicted" | null;
  valid_as_of: string | null;
  valid_as_of_precision: TimelineStatusFact["valid_as_of_precision"] | null;
  /** The fact that decided the state, for the researcher panel. Null when nothing decided it. */
  fact_code: string | null;
  /** Every claim still in force at the chosen year, so a panel can show what was weighed. */
  candidates: Array<{ fact_code: string; value: string; valid_as_of: string; verification_state: FactVerificationState }>;
}

/** Claims the atlas has withdrawn are not evidence of a past state. */
const WITHDRAWN_STATES: ReadonlySet<FactVerificationState> = new Set(["rejected", "superseded"]);

const VERIFICATION_RANK: Record<FactVerificationState, number> = {
  verified: 0, corroborated: 1, single_source: 2, candidate: 3, disputed: 4, superseded: 5, rejected: 6,
};

/**
 * A year is the unit the user moves in, so a fact is compared by calendar year. `2015-05-31` is inside
 * 2015; `2016-01-01` is not. Using the year prefix rather than a parsed Date keeps this independent of
 * the runtime's timezone, which is the kind of bug that makes a timeline disagree with itself.
 */
export function factYear(fact: Pick<TimelineStatusFact, "valid_as_of">): number {
  return Number.parseInt(fact.valid_as_of.slice(0, 4), 10);
}

/** The year on or before which a claim stops applying, if the claim declares one. */
function endYear(fact: TimelineStatusFact): number | null {
  if (!fact.valid_to) return null;
  const year = Number.parseInt(fact.valid_to.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

/** Only dated, non-withdrawn `operational_status` claims with a status the map can draw are admissible. */
export function isAdmissibleStatusFact(fact: TimelineStatusFact): boolean {
  return fact.attribute === "operational_status"
    && Boolean(fact.valid_as_of)
    && !WITHDRAWN_STATES.has(fact.verification_state)
    && ENTITY_STATUSES.includes(fact.value as EntityStatus);
}

/**
 * The claims that were in force during `year`: recorded on or before it, and (when the claim declares an
 * end) not yet ended. A claim that ends in year Y is still true *during* Y, so the comparison is
 * `endYear >= year`, not `>`.
 */
function inForceAt(facts: readonly TimelineStatusFact[], year: number): TimelineStatusFact[] {
  return facts.filter((fact) => isAdmissibleStatusFact(fact) && factYear(fact) <= year && (endYear(fact) === null || endYear(fact)! >= year));
}

/**
 * Resolve every entity's status for a year.
 *
 * Rules, in order:
 * 1. Ignore undated, withdrawn, or non-status claims.
 * 2. Keep the claims in force at the year (see `inForceAt`).
 * 3. The *latest* `valid_as_of` wins — not the most severe status, not the most recently added row.
 * 4. If two or more claims share that latest date and disagree, the result is `unknown` with
 *    `verification_state: "conflicted"`. The atlas does not pick a winner between two sources that
 *    contradict each other on the same day.
 * 5. If they agree, the best-supported one is reported, but a `disputed` claim on the winning date keeps
 *    the result marked disputed. Disagreement is never flattened away.
 * 6. An entity with no admissible claim in force is present in the result with `status: "unknown"` and
 *    `dated: false`. It is *not* assumed operational, and it is not silently omitted.
 */
export function resolveStatusByYear(facts: readonly TimelineStatusFact[], year: number): Map<string, TimelineStatusResolution> {
  const grouped = new Map<string, TimelineStatusFact[]>();
  for (const fact of inForceAt(facts, year)) {
    const rows = grouped.get(fact.entity_code);
    if (rows) rows.push(fact);
    else grouped.set(fact.entity_code, [fact]);
  }

  const results = new Map<string, TimelineStatusResolution>();
  for (const [code, candidates] of grouped) {
    const latestDate = candidates.map((fact) => fact.valid_as_of).sort().at(-1)!;
    const atLatest = candidates.filter((fact) => fact.valid_as_of === latestDate);
    const candidatesView = atLatest
      .slice()
      .sort((a, b) => a.fact_code.localeCompare(b.fact_code))
      .map((fact) => ({ fact_code: fact.fact_code, value: fact.value, valid_as_of: fact.valid_as_of, verification_state: fact.verification_state }));

    const distinctStatuses = new Set(atLatest.map((fact) => fact.value));
    if (distinctStatuses.size > 1) {
      results.set(code, {
        status: "unknown", reported_status: null, not_drawn_reason: null, dated: true,
        verification_state: "conflicted",
        valid_as_of: latestDate,
        // The coarsest precision on the winning date is the honest one to show.
        valid_as_of_precision: byCoarsestPrecision(atLatest),
        fact_code: null,
        candidates: candidatesView,
      });
      continue;
    }

    const selected = atLatest.slice().sort((a, b) => VERIFICATION_RANK[a.verification_state] - VERIFICATION_RANK[b.verification_state]
      || a.fact_code.localeCompare(b.fact_code))[0]!;
    // If any claim on the winning date is disputed, the status is disputed — a better-supported twin that
    // happens to say the same thing does not make the dispute go away. The value still stands (they agree),
    // but the caveat travels with it.
    const disputed = atLatest.some((fact) => fact.verification_state === "disputed");
    const drawable = DRAWABLE_STATES.has(selected.verification_state) && !(disputed && selected.verification_state !== "disputed");
    const agreedStatus = selected.value as EntityStatus;
    results.set(code, {
      status: drawable ? agreedStatus : "unknown",
      // An unreviewed claim is still worth reporting in the panel; it just may not repaint the map.
      reported_status: drawable ? null : agreedStatus,
      not_drawn_reason: drawable ? null : "unreviewed",
      dated: true,
      verification_state: disputed ? "disputed" : selected.verification_state,
      valid_as_of: selected.valid_as_of,
      valid_as_of_precision: selected.valid_as_of_precision,
      fact_code: selected.fact_code,
      candidates: candidatesView,
    });
  }
  return results;
}

function byCoarsestPrecision(facts: readonly TimelineStatusFact[]): TimelineStatusFact["valid_as_of_precision"] {
  const order: Array<TimelineStatusFact["valid_as_of_precision"]> = ["year", "month", "day"];
  return order.find((precision) => facts.some((fact) => fact.valid_as_of_precision === precision)) ?? "day";
}

/**
 * The range the slider may move through: the earliest dated status claim in the seed through this year.
 * The upper bound is never the latest claim — a project opening next decade must still be reachable, and
 * a sparsely dated dataset must not silently stop the timeline in the past.
 */
export function timelineYearRange(facts: readonly TimelineStatusFact[], now = new Date()): { min: number; max: number; latest_fact_year: number | null } {
  const years = facts.filter(isAdmissibleStatusFact).map(factYear).filter((year) => Number.isFinite(year));
  const thisYear = now.getUTCFullYear();
  const latestFactYear = years.length ? Math.max(...years) : null;
  return {
    min: years.length ? Math.min(...years) : thisYear,
    max: Math.max(thisYear, latestFactYear ?? thisYear),
    latest_fact_year: latestFactYear,
  };
}

/** How many entities the year changes relative to a base map, so the UI can be honest about the movement. */
export function timelineSummary(facts: readonly TimelineStatusFact[], year: number): {
  entities_with_dated_claim: number;
  entities_drawn: number;
  entities_unreviewed: number;
  entities_conflicted: number;
  entities_disputed: number;
} {
  let dated = 0; let drawn = 0; let unreviewed = 0; let conflicted = 0; let disputed = 0;
  for (const resolution of resolveStatusByYear(facts, year).values()) {
    if (resolution.dated) dated += 1;
    if (resolution.status !== "unknown") drawn += 1;
    if (resolution.not_drawn_reason === "unreviewed") unreviewed += 1;
    if (resolution.verification_state === "conflicted") conflicted += 1;
    if (resolution.verification_state === "disputed") disputed += 1;
  }
  return { entities_with_dated_claim: dated, entities_drawn: drawn, entities_unreviewed: unreviewed, entities_conflicted: conflicted, entities_disputed: disputed };
}

/** The label for an entity the timeline cannot speak about. */
export function undatedStatusLabel(language: "ar" | "en"): string {
  return language === "ar" ? "غير معروف في هذا التاريخ" : "Unknown at this date";
}

/** Why a status the panel reports was not allowed to colour the map. */
export function notDrawnReasonLabel(language: "ar" | "en", reason: nonNullableReason): string {
  return reason === "unreviewed"
    ? (language === "ar" ? "الادعاء المؤرخ لم يُراجَع بعد، فلا يغيّر الخريطة." : "The dated claim is unreviewed, so it does not change the map.")
    : "";
}
type nonNullableReason = NonNullable<TimelineStatusResolution["not_drawn_reason"]>;

/** The reason, shown in the researcher panel, for why a drawn status may differ from the curated column. */
export function timelineDisagreementNote(language: "ar" | "en"): string {
  return language === "ar"
    ? "الحالة المعروضة تتغير حسب السنة المختارة، وقد تختلف عن الحالة المنشورة لأن آخر ادعاء مؤرخ لا يطابق العمود المنقح. الاثنان ظاهران ولم يُرجَّح أحدهما آليًا."
    : "The status shown changes with the selected year and may differ from the published status because the latest dated claim does not match the curated column. Both remain visible; neither is resolved automatically.";
}
