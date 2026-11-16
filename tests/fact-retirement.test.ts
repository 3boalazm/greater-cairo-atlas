import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { excludeRetiredFacts, getStaticAtlasDataset } from "@/lib/atlas/static-dataset";

describe("append-only fact retirement", () => {
  it("audits both candidates and rejects unretirement and deletion", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE TABLE entities (id uuid PRIMARY KEY, code text UNIQUE);
        CREATE TABLE facts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE, entity_id uuid REFERENCES entities(id), verification_state text);
        CREATE TABLE admin_audit_log (actor text, action text CONSTRAINT admin_audit_log_action_check CHECK (action IN ('fact.approve')), entity_code text, fact_code text, reason text, before_state jsonb, after_state jsonb);
        INSERT INTO entities VALUES ('00000000-0000-0000-0000-000000000001', 'STOP-TEST');
        INSERT INTO facts (code, entity_id, verification_state) VALUES
         ('F-STOP-AHMED-OMAR-HASHEM-OSM-NODE-ID-1','00000000-0000-0000-0000-000000000001','candidate'),
         ('F-STOP-AHMED-OMAR-HASHEM-OSM-NODE-ID-2','00000000-0000-0000-0000-000000000001','candidate');`);
      await db.exec(await readFile("db/migrations/012_fact_retirement.sql", "utf8"));
      const rows = await db.query<{ action: string; reason: string }>("SELECT action, reason FROM admin_audit_log ORDER BY fact_code");
      expect(rows.rows).toHaveLength(2);
      expect(rows.rows.every((row) => row.action === "fact.retire" && row.reason.includes("d9abd04"))).toBe(true);
      await expect(db.exec("UPDATE facts SET retired_at=NULL, retired_reason=NULL")).rejects.toThrow(/append-only/);
      await expect(db.exec("DELETE FROM facts")).rejects.toThrow(/cannot be deleted/);
    } finally { await db.close(); }
  }, 30000);

  it("excludes retired facts and links together from the public snapshot", async () => {
    const dataset = await getStaticAtlasDataset();
    const fact = dataset.facts.find((item) => item.evidence_codes.length > 0)!;
    const filtered = excludeRetiredFacts(dataset, new Set([fact.code]));
    expect(filtered.facts.length).toBe(dataset.facts.length - 1);
    expect(filtered.factEvidence.some((link) => link.fact_code === fact.code)).toBe(false);
    expect(filtered.factEvidence.length).toBe(dataset.factEvidence.length - fact.evidence_codes.length);
  });
});
