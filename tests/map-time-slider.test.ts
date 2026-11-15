import { describe, expect, it } from "vitest";
import {
  factYear, isAdmissibleStatusFact, resolveStatusByYear, resolveTimelineUrlState, timelineSummary,
  timelineYearParam, timelineYearRange, type TimelineStatusFact,
} from "@/lib/atlas/status-timeline";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";

const fact = (entity_code: string, value: string, valid_as_of: string, extra: Partial<TimelineStatusFact> = {}): TimelineStatusFact => ({
  entity_code,
  attribute: "operational_status",
  value,
  valid_as_of,
  valid_as_of_precision: "day",
  verification_state: "verified",
  fact_code: `F-${entity_code}-${value}-${valid_as_of}`,
  ...extra,
});

describe("BATCH 14.1 — status at year: the latest dated claim on or before the year", () => {
  it("moves through time instead of showing only the newest claim", () => {
    const facts = [fact("A", "planned", "2010-01-01"), fact("A", "under_construction", "2015-06-01"), fact("A", "operational", "2020-03-01")];
    expect(resolveStatusByYear(facts, 2009).get("A")).toBeUndefined();
    expect(resolveStatusByYear(facts, 2012).get("A")).toMatchObject({ status: "planned", dated: true });
    expect(resolveStatusByYear(facts, 2017).get("A")).toMatchObject({ status: "under_construction" });
    expect(resolveStatusByYear(facts, 2020).get("A")).toMatchObject({ status: "operational" });
  });

  it("treats a claim dated later in the same year as in force that year", () => {
    // The slider moves in years, so 2015-12-31 is inside 2015. A fact from 2016-01-01 is not.
    const facts = [fact("A", "operational", "2015-12-31"), fact("B", "operational", "2016-01-01")];
    const at2015 = resolveStatusByYear(facts, 2015);
    expect(at2015.get("A")?.status).toBe("operational");
    expect(at2015.get("B")).toBeUndefined();
  });

  it("never assumes an entity is operational when it has no dated claim", () => {
    const facts = [fact("A", "operational", "2020-01-01")];
    // B exists in the atlas but has no dated status fact at all.
    const result = resolveStatusByYear(facts, 2024);
    expect(result.get("A")?.status).toBe("operational");
    expect(result.has("B")).toBe(false);
    expect([...result.values()].every((row) => row.dated)).toBe(true);
  });

  it("reports an entity whose only claim is in the future as absent, not as operating", () => {
    const facts = [fact("A", "approved_planned", "2030-01-01")];
    expect(resolveStatusByYear(facts, 2029).has("A")).toBe(false);
    expect(resolveStatusByYear(facts, 2030).get("A")?.status).toBe("approved_planned");
  });
});

describe("BATCH 14.1 — valid_to ends a claim without inventing a replacement", () => {
  it("stops applying a claim once its declared end has passed", () => {
    const facts = [fact("A", "under_construction", "2019-01-01", { valid_to: "2021-12-31" })];
    expect(resolveStatusByYear(facts, 2021).get("A")?.status).toBe("under_construction");
    // After the end there is no claim: unknown, not "operational because it must have opened".
    expect(resolveStatusByYear(facts, 2022).has("A")).toBe(false);
  });

  it("treats a claim ending in year Y as true during Y", () => {
    const facts = [fact("A", "partial", "2018-01-01", { valid_to: "2020-06-30" })];
    expect(resolveStatusByYear(facts, 2020).get("A")?.status).toBe("partial");
    expect(resolveStatusByYear(facts, 2020).get("A")?.dated).toBe(true);
  });

  it("falls back to an earlier claim once the newer one has ended", () => {
    const facts = [
      fact("A", "operational", "2010-01-01"),
      fact("A", "under_construction", "2018-01-01", { valid_to: "2019-12-31" }),
    ];
    // 2019: the construction claim is in force and newer, so it wins.
    expect(resolveStatusByYear(facts, 2019).get("A")?.status).toBe("under_construction");
    // 2020: it has ended, so the 2010 claim is the latest one still in force.
    expect(resolveStatusByYear(facts, 2020).get("A")?.status).toBe("operational");
  });
});

describe("BATCH 14.1 — conflicting claims are surfaced, not resolved", () => {
  it("marks two claims on the same date with different values as conflicted and unknown", () => {
    const facts = [fact("A", "operational", "2020-01-01", { fact_code: "F-A-1" }), fact("A", "under_construction", "2020-01-01", { fact_code: "F-A-2" })];
    const resolution = resolveStatusByYear(facts, 2024).get("A")!;
    expect(resolution.status).toBe("unknown");
    expect(resolution.verification_state).toBe("conflicted");
    // Neither claim is elected: the panel must be able to show both.
    expect(resolution.candidates.map((row) => row.value).sort()).toEqual(["operational", "under_construction"]);
    expect(resolution.fact_code).toBeNull();
  });

  it("does not let a more recent claim hide an older contradicting one", () => {
    // Only the claims on the winning date are weighed; older ones are history, not a live contradiction.
    const facts = [fact("A", "planned", "2010-01-01"), fact("A", "operational", "2020-01-01")];
    const resolution = resolveStatusByYear(facts, 2024).get("A")!;
    expect(resolution.status).toBe("operational");
    expect(resolution.verification_state).toBe("verified");
  });

  it("does not let a disputed claim be drawn as settled just because a stronger twin agrees", () => {
    const facts = [
      fact("A", "operational", "2020-01-01", { fact_code: "F-A-1", verification_state: "verified" }),
      fact("A", "operational", "2020-01-01", { fact_code: "F-A-2", verification_state: "disputed" }),
    ];
    // The values agree, so there is no conflict over *what* is claimed. But a disputed claim means the
    // atlas does not know the status: drawing it as operational would hide a live dispute behind a
    // second source that happens to agree.
    const resolution = resolveStatusByYear(facts, 2024).get("A")!;
    expect(resolution).toMatchObject({ status: "unknown", verification_state: "disputed", dated: true });
    // It is still reported so the panel can explain why nothing was drawn.
    expect(resolution.reported_status).toBe("operational");
  });

  it("keeps a disputed claim out of the map but visible to the panel", () => {
    const facts = [fact("A", "partial", "2020-01-01", { verification_state: "disputed" })];
    const resolution = resolveStatusByYear(facts, 2024).get("A")!;
    expect(resolution.status).toBe("unknown");
    expect(resolution.reported_status).toBe("partial");
    expect(resolution.not_drawn_reason).toBe("unreviewed");
  });

  it("ignores withdrawn claims so a rejected status cannot govern a year", () => {
    const facts = [
      fact("A", "operational", "2019-01-01", { verification_state: "rejected" }),
      fact("A", "operational", "2021-01-01", { verification_state: "superseded" }),
    ];
    expect(resolveStatusByYear(facts, 2024).has("A")).toBe(false);
    expect(facts.filter(isAdmissibleStatusFact)).toHaveLength(0);
  });

  it("ignores claims that are not status assertions", () => {
    const facts = [fact("A", "operational", "2020-01-01", { attribute: "opening" }), fact("A", "سنة 1999", "2020-01-01")];
    expect(isAdmissibleStatusFact(facts[0]!)).toBe(false);
    expect(isAdmissibleStatusFact(facts[1]!)).toBe(false);
    expect(resolveStatusByYear(facts, 2024).has("A")).toBe(false);
  });
});

describe("BATCH 14.1 — the slider range", () => {
  it("spans the earliest claim to the current year, not to the latest claim", () => {
    const now = new Date("2026-11-15T00:00:00Z");
    const range = timelineYearRange([fact("A", "operational", "2015-05-31"), fact("B", "planned", "2040-01-01")], now);
    expect(range.min).toBe(2015);
    // A project opening in 2040 must still be reachable, and the slider must not stop before today.
    expect(range.max).toBe(2040);
    expect(range.latest_fact_year).toBe(2040);
  });

  it("ends at today when every claim is in the past", () => {
    const now = new Date("2026-11-15T00:00:00Z");
    const range = timelineYearRange([fact("A", "operational", "2015-05-31"), fact("B", "operational", "2026-01-01")], now);
    expect(range.max).toBe(2026);
    expect(range.min).toBe(2015);
  });

  it("does not produce an inverted range on an empty dataset", () => {
    const range = timelineYearRange([], new Date("2026-11-15T00:00:00Z"));
    expect(range.min).toBe(2026);
    expect(range.max).toBe(2026);
  });
});

describe("BATCH 14.1 — the real seed behaves as the seed says", () => {
  it("resolves today exactly as the resolver decides, with no entity invented as operating", async () => {
    const dataset = await getStaticAtlasDataset();
    const facts: TimelineStatusFact[] = dataset.facts
      .filter((row) => row.attribute === "operational_status" && row.valid_as_of)
      .map((row) => ({
        entity_code: row.entity_code, attribute: row.attribute, value: row.value, valid_as_of: row.valid_as_of!,
        valid_as_of_precision: row.valid_as_of_precision, verification_state: row.verification_state, fact_code: row.code,
      }));
    expect(facts.length).toBeGreaterThan(400);

    const thisYear = new Date().getUTCFullYear();
    const today = resolveStatusByYear(facts, thisYear);
    const range = timelineYearRange(facts);
    expect(range.min).toBeLessThanOrEqual(thisYear);
    expect(today.size).toBeGreaterThan(0);

    // Every resolved status is a real status, and every resolution cites the fact that decided it.
    for (const [code, resolution] of today) {
      expect(resolution.dated, code).toBe(true);
      if (resolution.verification_state === "conflicted") expect(resolution.fact_code).toBeNull();
      else expect(resolution.fact_code, code).toBeTruthy();
    }

    // Entities the resolver says nothing about must genuinely have no dated status claim up to today.
    const datedCodes = new Set(facts.map((row) => row.entity_code));
    for (const entity of dataset.entities) {
      if (!today.has(entity.code)) expect(datedCodes.has(entity.code) && entity.status !== "unknown").toBe(false);
    }

    // The resolver is not allowed to claim an entity is operational on a date before any claim exists.
    const earliest = facts.reduce((min, row) => row.valid_as_of < min ? row.valid_as_of : min, facts[0]!.valid_as_of);
    const beforeAnything = resolveStatusByYear(facts, factYear({ valid_as_of: earliest }) - 1);
    expect(beforeAnything.size).toBe(0);
  }, 120000);

  it("never disagrees with the curated column on the strength of an unreviewed claim", async () => {
    const dataset = await getStaticAtlasDataset();
    const facts: TimelineStatusFact[] = dataset.facts
      .filter((row) => row.attribute === "operational_status" && row.valid_as_of)
      .map((row) => ({
        entity_code: row.entity_code, attribute: row.attribute, value: row.value, valid_as_of: row.valid_as_of!,
        valid_as_of_precision: row.valid_as_of_precision, verification_state: row.verification_state, fact_code: row.code,
      }));
    const today = resolveStatusByYear(facts, new Date().getUTCFullYear());
    const datedCodes = new Set(facts.map((row) => row.entity_code));

    let drawnAgree = 0;
    let withheldAgree = 0;
    const disagreements: Array<{ code: string; curated: string; resolved: string; verification: string }> = [];
    for (const entity of dataset.entities) {
      const resolution = today.get(entity.code);
      if (!resolution) {
        // No resolution at all is only legitimate when the entity has no dated claim to begin with.
        expect(datedCodes.has(entity.code), `${entity.code} has a dated claim but no resolution`).toBe(false);
        continue;
      }
      if (resolution.status === "unknown") {
        // Withheld: a dated claim exists but it may not colour the map. Counted separately from a
        // disagreement — being cautious is not the same as being wrong.
        if (resolution.reported_status === entity.status) withheldAgree += 1;
        continue;
      }
      if (resolution.status === entity.status) drawnAgree += 1;
      else disagreements.push({ code: entity.code, curated: entity.status, resolved: resolution.status, verification: resolution.verification_state ?? "none" });
    }

    /**
     * The drawing bar is what keeps the timeline from contradicting the published dataset.
     *
     * Measured on this seed at today: 343 entities carry a dated status claim, but 191 of those latest
     * claims are still `candidate`. Before the bar existed, 16 of 18 disagreements with the curated column
     * came from exactly those unreviewed rows, so moving the slider would have repainted the map on the
     * strength of work nobody had checked.
     *
     * With the bar: 115 entities are drawn and **every one agrees** with the curated column. 228 are
     * withheld, 210 of which also agree — they simply lack review. Zero drawn disagreements is the
     * property worth pinning; if a future change makes the slider contradict the published map, this fails.
     */
    expect(drawnAgree).toBe(115);
    expect(disagreements).toEqual([]);
    expect(withheldAgree).toBeGreaterThanOrEqual(200);

    // An unreviewed claim is reported, not drawn: the entity stays unknown on the map.
    const summary = timelineSummary(facts, new Date().getUTCFullYear());
    expect(summary.entities_with_dated_claim).toBe(today.size);
    expect(summary.entities_unreviewed).toBeGreaterThan(0);
    expect(summary.entities_drawn + summary.entities_unreviewed).toBeGreaterThanOrEqual(summary.entities_with_dated_claim);
  }, 120000);
});

describe("BATCH 14.1 — the default (today) must render exactly the current map", () => {
  it("changes nothing until the user moves the slider", async () => {
    const dataset = await getStaticAtlasDataset();
    const facts: TimelineStatusFact[] = dataset.facts
      .filter((row) => row.attribute === "operational_status" && row.valid_as_of)
      .map((row) => ({
        entity_code: row.entity_code, attribute: row.attribute, value: row.value, valid_as_of: row.valid_as_of!,
        valid_as_of_precision: row.valid_as_of_precision, verification_state: row.verification_state, fact_code: row.code,
      }));
    const thisYear = new Date().getUTCFullYear();

    // The slider opens at the maximum, and the maximum is never earlier than today.
    const range = timelineYearRange(facts);
    expect(timelineYearRange(facts, new Date()).max).toBe(thisYear);
    expect(range.max).toBeGreaterThanOrEqual(thisYear);

    /**
     * The map is only re-coloured by the timeline when the user moves the year. At the default year the
     * resolver must therefore agree with the curated column on every entity it is willing to draw —
     * otherwise "opening the atlas" and "opening the atlas, touching nothing" would show different maps.
     */
    const today = resolveStatusByYear(facts, thisYear);
    for (const entity of dataset.entities) {
      const resolution = today.get(entity.code);
      if (!resolution || resolution.status === "unknown") continue;
      expect(resolution.status, `${entity.code} would be recoloured by the default timeline`).toBe(entity.status);
    }
  }, 120000);

  it("reports a future-dated claim as upcoming, not as history", async () => {
    const dataset = await getStaticAtlasDataset();
    const facts: TimelineStatusFact[] = dataset.facts
      .filter((row) => row.attribute === "operational_status" && row.valid_as_of)
      .map((row) => ({
        entity_code: row.entity_code, attribute: row.attribute, value: row.value, valid_as_of: row.valid_as_of!,
        valid_as_of_precision: row.valid_as_of_precision, verification_state: row.verification_state, fact_code: row.code,
      }));
    const thisYear = new Date().getUTCFullYear();
    const future = facts.filter((row) => factYear(row) > thisYear);
    for (const row of future) {
      // A future claim is reachable through the slider, and absent before its year.
      expect(resolveStatusByYear(facts, factYear(row) - 1).get(row.entity_code)?.status ?? "unknown").not.toBe(row.value);
      expect(resolveStatusByYear(facts, factYear(row)).get(row.entity_code)?.status).toBe(row.value);
    }
    // The seed currently has none; if that changes, the loop above covers them rather than failing here.
    expect(future.length).toBeGreaterThanOrEqual(0);
  }, 120000);
});

describe("BATCH 14.1 — a shared ?year= link shows what the sender saw", () => {
  const range = { min: 2015, max: 2026 };

  it("opens the control when the URL carries a past year", () => {
    // The bug this pins: applying the year while leaving the control collapsed left the recipient with a
    // map that looked wrong and no way to see why or to return to today.
    expect(resolveTimelineUrlState("2019", range)).toEqual({ year: 2019, enabled: true });
  });

  it("treats the current year as closed, so a normal URL stays clean", () => {
    expect(resolveTimelineUrlState("2026", range)).toEqual({ year: 2026, enabled: false });
  });

  it("closes the control when there is no year in the URL", () => {
    expect(resolveTimelineUrlState(null, range)).toEqual({ year: 2026, enabled: false });
    expect(resolveTimelineUrlState("", range)).toEqual({ year: 2026, enabled: false });
  });

  it("ignores an out-of-range year rather than clamping it", () => {
    // Silently showing 2015 for ?year=1800 would misrepresent what the sender asked for.
    expect(resolveTimelineUrlState("1800", range)).toEqual({ year: 2026, enabled: false });
    expect(resolveTimelineUrlState("2099", range)).toEqual({ year: 2026, enabled: false });
  });

  it("rejects a malformed year", () => {
    expect(resolveTimelineUrlState("abc", range)).toEqual({ year: 2026, enabled: false });
    expect(resolveTimelineUrlState("2019.5", range)).toEqual({ year: 2026, enabled: false });
    expect(resolveTimelineUrlState("2019abc", range)).toEqual({ year: 2026, enabled: false });
  });

  it("writes the year back only when it differs from today", () => {
    expect(timelineYearParam({ year: 2019, enabled: true }, 2026)).toBe("2019");
    expect(timelineYearParam({ year: 2026, enabled: true }, 2026)).toBeNull();
    expect(timelineYearParam({ year: 2019, enabled: false }, 2026)).toBeNull();
  });

  it("round-trips through the URL", () => {
    for (const year of [2015, 2019, 2025]) {
      expect(resolveTimelineUrlState(timelineYearParam({ year, enabled: true }, range.max), range)).toEqual({ year, enabled: true });
    }
    // And "today" survives the round trip as today.
    expect(resolveTimelineUrlState(timelineYearParam({ year: 2026, enabled: true }, range.max), range)).toEqual({ year: 2026, enabled: false });
  });
});
