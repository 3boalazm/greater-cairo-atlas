import { describe, expect, it } from "vitest";
import { csvToImportPayload, parseCsv, planImport, verifiedRowRejection, type ExistingState } from "@/lib/admin/import-pipeline";

const existing: ExistingState = {
  entity_codes: new Set(["CITY-OBOUR", "CITY-6-OCTOBER"]),
  fact_codes: new Set(["F-CITY-OBOUR-STATUS-1"]),
  evidence_codes: new Set(["EV-1"]),
  entities: [
    { code: "CITY-OBOUR", name_ar: "العبور", name_en: "El Obour", aliases: [] },
    { code: "CITY-6-OCTOBER", name_ar: "6 أكتوبر", name_en: "6th of October", aliases: ["أكتوبر"] },
  ],
  fact_values: new Map([["F-CITY-OBOUR-STATUS-1", "operational"]]),
  evidence_urls: new Map([["EV-1", "https://example.gov.eg/a"]]),
  fact_attributes_by_entity: new Map([["CITY-OBOUR", new Map([["operational_status", "operational"]])]]),
};

const officialEvidence = { code: "EV-2", title: "Ministry report", url: "https://example.gov.eg/b", source_type: "official" };
const noUrlEvidence = { code: "EV-3", title: "News item", url: null, source_type: "news" };

const payload = (rows: Record<string, unknown>) => JSON.stringify(rows);

describe("BATCH 13 — import dry-run is the default and writes nothing", () => {
  it("plans a new entity + evidence + fact as new, without touching anything", () => {
    const plan = planImport(payload({
      entities: [{ code: "CITY-NEW", name_ar: "مدينة جديدة", name_en: "New City", entity_type: "city", sector: "EAST", status: "operational" }],
      evidence: [officialEvidence],
      facts: [{ code: "F-CITY-NEW-STATUS-1", entity_code: "CITY-NEW", attribute: "operational_status", value: "operational", verification_state: "candidate", evidence_codes: ["EV-2"] }],
    }), existing);
    expect(plan.ok).toBe(true);
    expect(plan.counts.entities.new).toBe(1);
    expect(plan.counts.evidence.new).toBe(1);
    expect(plan.counts.facts.new).toBe(1);
    expect(plan.actionable.entities.map((row) => row.code)).toEqual(["CITY-NEW"]);
    // A plan is inert: the input state is unchanged (nothing here can mutate it).
    expect(existing.entity_codes.has("CITY-NEW")).toBe(false);
  });

  it("rejects malformed payloads with a readable issue instead of throwing", () => {
    const plan = planImport("{ not json", existing);
    expect(plan.ok).toBe(false);
    expect(plan.issues[0]!.message).toContain("Invalid JSON");
    expect(plan.actionable.entities).toHaveLength(0);
  });

  it("rejects an entity row missing a required field and says which", () => {
    const plan = planImport(payload({ entities: [{ code: "X", name_ar: "بدون اسم انجليزي", entity_type: "city", sector: "EAST", status: "operational" }] }), existing);
    expect(plan.ok).toBe(true);
    expect(plan.counts.entities.rejected).toBe(1);
    expect(plan.rejected_rows[0]!.reason).toContain("name_en");
  });
});

describe("BATCH 13 — the verified rule is enforced at import, not just in review", () => {
  it("rejects a verified fact whose only source is a blog in the same payload", () => {
    const plan = planImport(JSON.stringify({
      entities: [],
      evidence: [{ code: "EV-BLOG-9", title: "A blog", url: "https://blog.example.org/p", source_type: "secondary" }],
      facts: [{ code: "F-9", entity_code: "CITY-OBOUR", attribute: "bus_provider", value: "Private", verification_state: "verified", evidence_codes: ["EV-BLOG-9"] }],
    }), existing);
    expect(plan.rejected_rows.find((row) => row.code === "F-9")!.reason).toContain("official source with a usable URL");
    expect(plan.actionable.facts).toHaveLength(0);
  });

  it("accepts a verified fact citing an official URL already stored in the database", () => {
    // A curated import legitimately marks claims verified when the database already holds the source.
    // Judging those needs the stored source type, not just the URL.
    const state = {
      ...existing,
      evidence_codes: new Set(["EV-STORED-1"]),
      evidence_urls: new Map([["EV-STORED-1", "https://example.gov.eg/stored"]]),
      evidence_source_types: new Map([["EV-STORED-1", "official"]]),
    };
    const plan = planImport(JSON.stringify({
      entities: [],
      evidence: [],
      facts: [{ code: "F-10", entity_code: "CITY-OBOUR", attribute: "bus_provider", value: "CTA", verification_state: "verified", evidence_codes: ["EV-STORED-1"] }],
    }), state);
    expect(plan.rejected_rows).toHaveLength(0);
    expect(plan.actionable.facts).toHaveLength(1);
  });

  it("still refuses a verified fact when the stored source is not official", () => {
    const state = {
      ...existing,
      evidence_codes: new Set(["EV-STORED-2"]),
      evidence_urls: new Map([["EV-STORED-2", "https://blog.example.org/x"]]),
      evidence_source_types: new Map([["EV-STORED-2", "secondary"]]),
    };
    const plan = planImport(JSON.stringify({
      entities: [],
      evidence: [],
      facts: [{ code: "F-11", entity_code: "CITY-OBOUR", attribute: "bus_provider", value: "CTA", verification_state: "verified", evidence_codes: ["EV-STORED-2"] }],
    }), state);
    expect(plan.rejected_rows.find((row) => row.code === "F-11")).toBeDefined();
  });

  it("fails closed when the source type of stored evidence cannot be checked", () => {
    const state = { ...existing, evidence_codes: new Set(["EV-UNKNOWN-1"]), evidence_urls: new Map([["EV-UNKNOWN-1", "https://example.gov.eg/x"]]) };
    const plan = planImport(JSON.stringify({
      entities: [],
      evidence: [],
      facts: [{ code: "F-12", entity_code: "CITY-OBOUR", attribute: "bus_provider", value: "CTA", verification_state: "verified", evidence_codes: ["EV-UNKNOWN-1"] }],
    }), state);
    expect(plan.rejected_rows.find((row) => row.code === "F-12")!.reason).toContain("could not be checked");
  });

  it("rejects a fact marked verified whose only evidence has no URL", () => {
    const plan = planImport(payload({
      evidence: [noUrlEvidence],
      facts: [{ code: "F-1", entity_code: "CITY-OBOUR", attribute: "operational_status", value: "planned", verification_state: "verified", evidence_codes: ["EV-3"] }],
    }), existing);
    expect(plan.counts.facts.rejected).toBe(1);
    expect(plan.rejected_rows.find((row) => row.code === "F-1")!.reason).toContain("official source with a usable URL");
    expect(plan.actionable.facts).toHaveLength(0);
  });

  it("rejects a verified fact that cites no evidence", () => {
    const plan = planImport(payload({
      facts: [{ code: "F-2", entity_code: "CITY-OBOUR", attribute: "x", value: "y", verification_state: "verified", evidence_codes: [] }],
    }), existing);
    expect(plan.rejected_rows[0]!.reason).toContain("cites no evidence");
  });

  it("rejects a fact citing evidence that neither exists nor arrives with it", () => {
    const plan = planImport(payload({
      facts: [{ code: "F-3", entity_code: "CITY-OBOUR", attribute: "x", value: "y", verification_state: "candidate", evidence_codes: ["EV-MISSING"] }],
    }), existing);
    expect(plan.rejected_rows[0]!.reason).toContain("does not exist");
  });

  it("accepts a verified fact backed by existing official evidence", () => {
    const rejection = verifiedRowRejection(
      { code: "F-4", entity_code: "CITY-OBOUR", attribute: "x", value: "y", verification_state: "verified", evidence_codes: ["EV-1"], valid_as_of_precision: "day" },
      new Map([["EV-1", { code: "EV-1", source_type: "official", url: "https://example.gov.eg/a" }]]),
      new Set(["EV-1"]),
    );
    expect(rejection).toBeNull();
  });
});

describe("BATCH 13 — diff classifies new, changed, unchanged and conflicts", () => {
  it("never overwrites an existing entity, and says so", () => {
    const plan = planImport(payload({ entities: [{ code: "CITY-OBOUR", name_ar: "العبور", name_en: "El Obour", entity_type: "city", sector: "EAST", status: "operational" }] }), existing);
    expect(plan.counts.entities.unchanged).toBe(1);
    expect(plan.actionable.entities).toHaveLength(0);
    expect(plan.diff[0]!.reason).toContain("not overwritten");
  });

  it("flags a conflicting value for the same attribute as a conflict, not a new fact", () => {
    const plan = planImport(payload({
      evidence: [officialEvidence],
      facts: [{ code: "F-CITY-OBOUR-STATUS-2", entity_code: "CITY-OBOUR", attribute: "operational_status", value: "under_construction", verification_state: "candidate", evidence_codes: ["EV-2"] }],
    }), existing);
    expect(plan.counts.facts.conflict).toBe(1);
    expect(plan.actionable.facts).toHaveLength(0);
    expect(plan.diff.find((row) => row.category === "conflict")!.reason).toContain("«operational»");
  });

  it("treats an identical fact as unchanged and a differing value under the same code as changed", () => {
    const same = planImport(payload({ facts: [{ code: "F-CITY-OBOUR-STATUS-1", entity_code: "CITY-OBOUR", attribute: "operational_status", value: "operational", verification_state: "candidate", evidence_codes: ["EV-1"] }] }), existing);
    expect(same.counts.facts.unchanged).toBe(1);
    const changed = planImport(payload({ facts: [{ code: "F-CITY-OBOUR-STATUS-1", entity_code: "CITY-OBOUR", attribute: "operational_status", value: "planned", verification_state: "candidate", evidence_codes: ["EV-1"] }] }), existing);
    expect(changed.counts.facts.changed).toBe(1);
    expect(changed.actionable.facts).toHaveLength(0);
  });

  it("reports a duplicate rather than importing it twice", () => {
    const plan = planImport(payload({ entities: [{ code: "CITY-NEW-X", name_ar: "العبـور", name_en: "Other", entity_type: "city", sector: "EAST", status: "unknown" }] }), existing);
    expect(plan.duplicates.some((match) => match.match_type === "normalised_name_ar")).toBe(true);
    // Still actionable as a new code, but the conflict is surfaced for a human to decide.
    expect(plan.counts.entities.new).toBe(1);
    expect(plan.duplicates.length).toBeGreaterThan(0);
  });

  it("produces a stable checksum so a commit can prove it approved these bytes", () => {
    const text = payload({ entities: [] });
    expect(planImport(text, existing).checksum).toBe(planImport(text, existing).checksum);
    expect(planImport(text, existing).checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(planImport(text, existing).checksum).not.toBe(planImport(payload({ entities: [{ code: "Z" }] }), existing).checksum);
  });
});

describe("BATCH 13 — CSV upload in the seed's flat format", () => {
  it("parses quoted fields containing commas and doubled quotes", () => {
    const { rows, error } = parseCsv('code,name_ar\nCITY-A,"مدينة, كبيرة"\nCITY-B,"say ""hi"""\n');
    expect(error).toBeNull();
    expect(rows).toEqual([{ code: "CITY-A", name_ar: "مدينة, كبيرة" }, { code: "CITY-B", name_ar: 'say "hi"' }]);
  });

  it("refuses an unterminated quote instead of guessing", () => {
    expect(parseCsv('code,name\nA,"unterminated\n').error).toContain("Unterminated");
  });

  it("converts a facts CSV into the pipeline payload", () => {
    const { payload: converted, error } = csvToImportPayload("code,entity_code,attribute,value,verification_state,evidence_codes\nF-9,CITY-OBOUR,x,y,candidate,EV-1|EV-2\n", "facts");
    expect(error).toBeNull();
    const plan = planImport(converted, existing);
    expect(plan.ok).toBe(true);
    // Both cited evidence rows must resolve, so this row is rejected rather than imported blind.
    expect(plan.rejected_rows.some((row) => row.reason.includes("EV-2"))).toBe(true);
  });
});
