import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import { commitImportPlan } from "@/lib/admin/import-commit";
import { planImport, type ExistingState } from "@/lib/admin/import-pipeline";
import type { SqlExecutor } from "@/lib/admin/queries";

/** Applies the real migrations, so the commit is tested against the constraints that actually ship. */
async function migratedDatabase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { postgis } });
  const dir = path.join(process.cwd(), "db/migrations");
  for (const file of [
    "000_enable_postgis.sql", "001_core_schema.sql", "002_entity_taxonomy.sql", "003_research_seed_extensions.sql",
    "004_feature_bbox_attribution.sql", "009_entity_relations.sql", "010_submissions.sql", "011_admin_review.sql",
  ]) {
    await db.exec(await readFile(path.join(dir, file), "utf8"));
  }
  return db;
}

const executor = (db: PGlite): SqlExecutor => ({
  async query<Row>(text: string, values?: unknown[]): Promise<Row[]> {
    const result = await db.query(text, values);
    return result.rows as Row[];
  },
});

/** Nothing in the database yet, but one entity for the import to attach facts to. */
async function emptyState(db: PGlite): Promise<ExistingState> {
  await db.exec(`INSERT INTO entities (code, name_ar, name_en, entity_type, sector, status)
    VALUES ('CITY-OBOUR','العبور','El Obour','city','EAST','operational');`);
  return {
    entity_codes: new Set(["CITY-OBOUR"]),
    fact_codes: new Set(),
    evidence_codes: new Set(),
    entities: [{ code: "CITY-OBOUR", name_ar: "العبور", name_en: "El Obour", aliases: [] }],
    fact_values: new Map(),
    evidence_urls: new Map(),
    fact_attributes_by_entity: new Map(),
  };
}

const payload = JSON.stringify({
  entities: [],
  evidence: [{ code: "EV-IMPORT-1", title: "Ministry of Transport", url: "https://example.gov.eg/bus", publisher: "MoT", source_type: "official" }],
  facts: [{
    code: "F-OBOUR-BUS-PROVIDER-1", entity_code: "CITY-OBOUR", attribute: "bus_provider",
    value: "CTA", verification_state: "candidate", evidence_codes: ["EV-IMPORT-1"],
  }],
});

describe("BATCH 13 — committing an import inserts only what was previewed", () => {
  it("inserts the evidence, the fact and the link, all as candidates", async () => {
    const db = await migratedDatabase();
    try {
      const existing = await emptyState(db);
      const plan = planImport(payload, existing);
      expect(plan.ok).toBe(true);

      const result = await commitImportPlan(executor(db), plan);
      expect(result).toEqual({ entities: 0, facts: 1, evidence: 1, skipped_fact_links: 0 });

      const fact = await db.query<{ verification_state: string; value: string }>(
        "SELECT verification_state, value FROM facts WHERE code = 'F-OBOUR-BUS-PROVIDER-1'");
      expect(fact.rows).toHaveLength(1);
      expect(fact.rows[0]!.verification_state).toBe("candidate");
      expect(fact.rows[0]!.value).toBe("CTA");

      const link = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM fact_evidence fe
           JOIN facts f ON f.id = fe.fact_id JOIN evidence e ON e.id = fe.evidence_id
          WHERE f.code = 'F-OBOUR-BUS-PROVIDER-1' AND e.code = 'EV-IMPORT-1'`);
      expect(Number(link.rows[0]!.count)).toBe(1);
    } finally { await db.close(); }
  }, 60000);

  it("is idempotent: committing the same plan twice inserts nothing the second time", async () => {
    const db = await migratedDatabase();
    try {
      const existing = await emptyState(db);
      const plan = planImport(payload, existing);
      await commitImportPlan(executor(db), plan);
      const second = await commitImportPlan(executor(db), plan);
      expect(second).toEqual({ entities: 0, facts: 0, evidence: 0, skipped_fact_links: 0 });

      const count = await db.query<{ count: string }>("SELECT COUNT(*) AS count FROM facts");
      expect(Number(count.rows[0]!.count)).toBe(1);
    } finally { await db.close(); }
  }, 60000);

  it("never inserts a rejected row, even if it is handed to the commit", async () => {
    const db = await migratedDatabase();
    try {
      const existing = await emptyState(db);
      // A `verified` claim backed only by a non-official source must be rejected by the planner.
      const badPayload = JSON.stringify({
        entities: [],
        evidence: [{ code: "EV-BLOG-1", title: "A blog", url: "https://blog.example.org/post", publisher: "Blog", source_type: "secondary" }],
        facts: [{
          code: "F-OBOUR-BUS-PROVIDER-2", entity_code: "CITY-OBOUR", attribute: "bus_provider",
          value: "Private", verification_state: "verified", evidence_codes: ["EV-BLOG-1"],
        }],
      });
      const plan = planImport(badPayload, existing);
      // `ok` describes the payload's structure; a bad row is rejected rather than blocking the whole
      // file, which is what lets a large legitimate import go through with a few rows flagged.
      expect(plan.ok).toBe(true);
      expect(plan.actionable.facts).toHaveLength(0);
      expect(plan.rejected_rows.find((row) => row.code === "F-OBOUR-BUS-PROVIDER-2")?.reason)
        .toContain("official source with a usable URL");

      const result = await commitImportPlan(executor(db), plan);
      expect(result.facts).toBe(0);
      const count = await db.query<{ count: string }>("SELECT COUNT(*) AS count FROM facts");
      expect(Number(count.rows[0]!.count)).toBe(0);
    } finally { await db.close(); }
  }, 60000);

  it("does not create a fact against an entity that does not exist", async () => {
    const db = await migratedDatabase();
    try {
      const existing = await emptyState(db);
      // The planner cannot know the entity was deleted between preview and commit; the INSERT resolves
      // the entity by code, so a missing one inserts nothing rather than attaching to the wrong row.
      const orphanPayload = JSON.stringify({
        entities: [],
        evidence: [{ code: "EV-IMPORT-2", title: "Source", url: "https://example.gov.eg/x", publisher: "MoT", source_type: "official" }],
        facts: [{
          code: "F-GHOST-1", entity_code: "CITY-OBOUR", attribute: "bus_provider",
          value: "CTA", verification_state: "candidate", evidence_codes: ["EV-IMPORT-2"],
        }],
      });
      const plan = planImport(orphanPayload, existing);
      await db.exec("DELETE FROM entities WHERE code = 'CITY-OBOUR'");
      const result = await commitImportPlan(executor(db), plan);
      expect(result.facts).toBe(0);
      const count = await db.query<{ count: string }>("SELECT COUNT(*) AS count FROM facts");
      expect(Number(count.rows[0]!.count)).toBe(0);
    } finally { await db.close(); }
  }, 60000);
});
