import { ENTITY_STATUSES, type EntityStatus, type FactVerificationState } from "@/lib/atlas/schema";

export interface TimelineStatusFact {
  entity_code: string;
  attribute: string;
  value: string;
  valid_as_of: string;
  valid_as_of_precision: "day" | "month" | "year";
  verification_state: FactVerificationState;
  fact_code: string;
}
export interface TimelineStatusResult {
  status: EntityStatus;
  dated: boolean;
  verification_state: FactVerificationState | "conflicted" | null;
  valid_as_of: string | null;
  valid_as_of_precision: TimelineStatusFact["valid_as_of_precision"] | null;
}

export function statusesAtYear(facts: readonly TimelineStatusFact[], year: number): Map<string, TimelineStatusResult> {
  const byEntity = new Map<string, TimelineStatusFact[]>();
  for (const fact of facts) {
    if (fact.attribute !== "operational_status" || Number(fact.valid_as_of.slice(0, 4)) > year ||
        ["rejected", "superseded"].includes(fact.verification_state) || !ENTITY_STATUSES.includes(fact.value as EntityStatus)) continue;
    byEntity.set(fact.entity_code, [...(byEntity.get(fact.entity_code) ?? []), fact]);
  }
  const results = new Map<string, TimelineStatusResult>();
  for (const [code, candidates] of byEntity) {
    candidates.sort((a, b) => a.valid_as_of.localeCompare(b.valid_as_of) || a.fact_code.localeCompare(b.fact_code));
    const latestDate = candidates.at(-1)!.valid_as_of;
    const latest = candidates.filter((fact) => fact.valid_as_of === latestDate);
    const states = new Set(latest.map((fact) => fact.value));
    if (states.size > 1) {
      results.set(code, { status: "unknown", dated: true, verification_state: "conflicted", valid_as_of: latestDate,
        valid_as_of_precision: latest.sort((a, b) => a.valid_as_of_precision.localeCompare(b.valid_as_of_precision))[0]!.valid_as_of_precision });
      continue;
    }
    const selected = latest.sort((a, b) => (a.verification_state === "disputed" ? -1 : b.verification_state === "disputed" ? 1 : verificationRank(a.verification_state) - verificationRank(b.verification_state)) || a.fact_code.localeCompare(b.fact_code))[0]!;
    results.set(code, { status: selected.value as EntityStatus, dated: true, verification_state: selected.verification_state,
      valid_as_of: selected.valid_as_of, valid_as_of_precision: selected.valid_as_of_precision });
  }
  return results;
}

function verificationRank(state: FactVerificationState): number {
  return ({ verified: 0, corroborated: 1, single_source: 2, candidate: 3, disputed: 4, superseded: 5, rejected: 6 })[state];
}
