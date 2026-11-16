import path from "node:path";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadAndValidateSeedDir } from "@/lib/atlas/seed";

describe("rev9 additive status delta", () => {
  it("adds exactly six namespaced news sources and nine non-verified facts without status drift", async () => {
    const root = process.cwd();
    const [bundle, rawEvidenceText, rawFactsText, changesText] = await Promise.all([
      loadAndValidateSeedDir(path.join(root, "data/seed")),
      readFile(path.join(root, "data/research/rev9-status/evidence_rev9.json"), "utf8"),
      readFile(path.join(root, "data/research/rev9-status/facts_rev9.json"), "utf8"),
      readFile(path.join(root, "data/research/rev9-status/status_changes_rev9.json"), "utf8"),
    ]);
    const rawEvidence = JSON.parse(rawEvidenceText) as Array<{ evidence_ref: string; source_type: string }>;
    const rawFacts = JSON.parse(rawFactsText) as Array<{ entity_code: string; attribute_key: string; value: string | number; unit: string | null; status_as_of: string; verification_state: string; evidence_ref: string }>;
    const changes = JSON.parse(changesText) as Array<{ entity_code: string; from: string; to: string; basis: string[] }>;
    const expectedStatuses = new Map([
      ["ROAD-AMR-IBN-ALAS", "operational"],
      ["ROAD-REGIONAL-NW-ARC", "operational"],
      ["TRANSIT-SUPERJET", "operational"],
    ]);

    expect(changes).toHaveLength(3);
    expect(new Map(changes.map((change) => [change.entity_code, change.to]))).toEqual(expectedStatuses);
    expect(changes.every((change) => change.from === "unknown")).toBe(true);
    expect(bundle.entities.filter((entity) => entity.status === "unknown")).toHaveLength(8);
    for (const [code, status] of expectedStatuses) {
      expect(bundle.entities.find((entity) => entity.code === code)?.status).toBe(status);
    }

    const rev9Refs = rawEvidence.map((source) => source.evidence_ref);
    expect(rawEvidence).toHaveLength(6);
    expect(rev9Refs).toEqual(expect.arrayContaining(["EV-R9-001", "EV-R9-002", "EV-R9-003", "EV-R9-004", "EV-R9-005", "EV-R9-006"]));
    expect(new Set(rev9Refs).size).toBe(6);
    expect(rev9Refs.every((ref) => /^EV-R9-\d{3}$/.test(ref))).toBe(true);
    expect(rawEvidence.every((source) => source.source_type === "news")).toBe(true);
    const canonicalRefs = bundle.evidence.map((source) => source.code);
    expect(new Set(canonicalRefs).size).toBe(canonicalRefs.length);
    expect(canonicalRefs.filter((ref) => ref.startsWith("EV-R9-")).sort()).toEqual([...rev9Refs].sort());

    const addedFacts = bundle.facts.filter((fact) => fact.evidence_codes.some((ref) => ref.startsWith("EV-R9-")));
    expect(rawFacts).toHaveLength(9);
    expect(addedFacts).toHaveLength(9);
    expect(addedFacts.every((fact) => fact.verification_state !== "verified")).toBe(true);
    for (const raw of rawFacts) {
      const match = addedFacts.find((fact) => fact.entity_code === raw.entity_code && fact.attribute === raw.attribute_key && fact.value === String(raw.value) && fact.unit === raw.unit && fact.valid_as_of === raw.status_as_of && fact.evidence_codes.includes(raw.evidence_ref));
      expect(match, `${raw.entity_code} ${raw.attribute_key} → ${raw.evidence_ref}`).toBeDefined();
      expect(match?.verification_state).toBe(raw.verification_state);
    }
    expect(addedFacts.filter((fact) => fact.entity_code === "ROAD-REGIONAL-NW-ARC" && fact.attribute === "maintenance_closure")).toHaveLength(1);
    expect(bundle.evidence).toHaveLength(730);
    expect(bundle.facts).toHaveLength(2685);
  });
});
