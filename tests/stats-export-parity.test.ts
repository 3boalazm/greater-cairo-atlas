import { describe, expect, it, vi } from "vitest";
const { dataset } = vi.hoisted(() => ({ dataset: {
  entities: [{ code: "ENTITY" }], facts: [{ code: "ACTIVE" }], evidence: [{ code: "SOURCE" }],
  factEvidence: [{ fact_code: "ACTIVE", evidence_code: "SOURCE" }], features: [], adminUnits: [], relations: [],
} }));
vi.mock("@/lib/atlas/static-dataset", () => ({
  getPublicAtlasDataset: async () => dataset,
  getExportMetadata: async () => ({ counts: {}, dataset_version: "test", generated_at: "test", import_checksum: "test", licenses: {} }),
}));
vi.mock("@/lib/atlas/stats", () => ({ getAtlasTableStats: async () => ({ httpStatus: 200, body: { ok: true, counts: { facts: 99 } } }) }));
import { GET as stats } from "@/app/api/atlas/stats/route";
import { GET as json } from "@/app/api/exports/json/route";
describe("public stats and export parity", () => {
  it("reports the public snapshot counts even when the database contains extra facts", async () => {
    const counts = (await (await stats()).json()).counts;
    const exported = await (await json()).json();
    expect(counts.facts).toBe(exported.facts.length);
    expect(counts.fact_evidence).toBe(exported.fact_evidence.length);
    expect(counts.entities).toBe(exported.entities.length);
    expect(counts.evidence).toBe(exported.evidence.length);
    expect(counts.features).toBe(exported.features.length);
  });
});
