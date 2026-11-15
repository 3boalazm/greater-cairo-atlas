import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import { getAdminCounts, listEntities, listFactsForReview, type SqlExecutor } from "@/lib/admin/queries";

/** Applies the real migrations in order, so the queries are tested against the production schema. */
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

async function seedFixtures(db: PGlite): Promise<void> {
  await db.exec(`
    INSERT INTO entities (code, name_ar, name_en, entity_type, sector, status) VALUES
      ('CITY-OBOUR','العبور','El Obour','city','EAST','operational'),
      ('CITY-ALEXANDRIA','إسكندرية','Alexandria','city','REGIONAL','operational'),
      ('DIST-AGOUZA','العجوزة','Agouza','district','WEST','unknown');
    INSERT INTO evidence (code, title, url, publisher, source_type, accessed_date) VALUES
      ('EV-OFFICIAL','Ministry report','https://example.gov.eg/report','Ministry','official','2026-11-01'),
      ('EV-NEWS','News item',NULL,'Outlet','news','2026-11-01');
    INSERT INTO facts (code, entity_id, attribute, value, verification_state)
      SELECT 'F-OBOUR-1', id, 'operational_status', 'operational', 'verified' FROM entities WHERE code='CITY-OBOUR';
    INSERT INTO facts (code, entity_id, attribute, value, verification_state)
      SELECT 'F-OBOUR-2', id, 'population', '500000', 'candidate' FROM entities WHERE code='CITY-OBOUR';
    INSERT INTO facts (code, entity_id, attribute, value, verification_state)
      SELECT 'F-OBOUR-3', id, 'population', '530000', 'candidate' FROM entities WHERE code='CITY-OBOUR';
    INSERT INTO facts (code, entity_id, attribute, value, verification_state)
      SELECT 'F-AGOUZA-1', id, 'operational_status', 'operational', 'candidate' FROM entities WHERE code='DIST-AGOUZA';
    INSERT INTO fact_evidence (fact_id, evidence_id)
      SELECT f.id, e.id FROM facts f, evidence e WHERE f.code='F-OBOUR-1' AND e.code='EV-OFFICIAL';
    INSERT INTO fact_evidence (fact_id, evidence_id)
      SELECT f.id, e.id FROM facts f, evidence e WHERE f.code='F-OBOUR-2' AND e.code='EV-OFFICIAL';
    INSERT INTO features (code, entity_id, geometry, license, properties)
      SELECT 'OSM-WAY-1', id, ST_SetSRID(ST_MakePoint(31.4, 30.2), 4326), 'ODbL-1.0', '{}'::jsonb FROM entities WHERE code='CITY-OBOUR';
    INSERT INTO submissions (entity_code, attribute, proposed_value, source_url, request_fingerprint)
      VALUES ('DIST-AGOUZA','operational_status','operational','https://example.org', repeat('a', 64));
  `);
}

describe("BATCH 13 — admin dashboard counts are real, not placeholders", () => {
  it("counts what is actually in the database", async () => {
    const db = await migratedDatabase();
    try {
      await seedFixtures(db);
      const counts = await getAdminCounts(executor(db));
      expect(counts.entities).toBe(3);
      expect(counts.facts).toBe(4);
      expect(counts.evidence).toBe(2);
      expect(counts.features).toBe(1);
      expect(counts.unknown_statuses).toBe(1);
      expect(counts.facts_without_evidence).toBe(2);
      expect(counts.entities_without_geometry).toBe(2);
      expect(counts.pending_submissions).toBe(1);
      expect(counts.unreviewed_facts).toBe(4);
      // Single-source: F-OBOUR-2 has one evidence row; F-OBOUR-1 also has exactly one.
      expect(counts.facts_single_source).toBe(2);
      // F-OBOUR-2 and F-OBOUR-3 disagree on `population` for the same entity.
      expect(counts.open_conflicts).toBe(1);
      // Boundaries are not a table, so this stays honestly null rather than inventing a count.
      expect(counts.boundaries).toBeNull();
    } finally { await db.close(); }
  }, 60000);

  it("reflects a review decision in unreviewed_facts", async () => {
    const db = await migratedDatabase();
    try {
      await seedFixtures(db);
      await db.query("INSERT INTO fact_reviews (fact_code, review_state, reviewer) VALUES ('F-OBOUR-1','approved','admin:abc')");
      const counts = await getAdminCounts(executor(db));
      expect(counts.unreviewed_facts).toBe(3);
    } finally { await db.close(); }
  }, 60000);
});

describe("BATCH 13 — server-side pagination and filters", () => {
  it("paginates in SQL and reports the true total", async () => {
    const db = await migratedDatabase();
    try {
      await seedFixtures(db);
      const first = await listEntities({ page: 1, page_size: 2 }, executor(db));
      expect(first.rows.map((row) => row.code)).toEqual(["CITY-ALEXANDRIA", "CITY-OBOUR"]);
      expect(first.total).toBe(3);
      const second = await listEntities({ page: 2, page_size: 2 }, executor(db));
      expect(second.rows.map((row) => row.code)).toEqual(["DIST-AGOUZA"]);
      expect(second.total).toBe(3);
    } finally { await db.close(); }
  }, 60000);

  it("filters by Arabic name, type, sector, status and geometry", async () => {
    const db = await migratedDatabase();
    try {
      await seedFixtures(db);
      const run = (filters: Parameters<typeof listEntities>[0]) => listEntities(filters, executor(db));
      expect((await run({ q: "العبور" })).rows.map((row) => row.code)).toEqual(["CITY-OBOUR"]);
      expect((await run({ q: "Alexandria" })).rows.map((row) => row.code)).toEqual(["CITY-ALEXANDRIA"]);
      expect((await run({ entity_type: "district" })).rows.map((row) => row.code)).toEqual(["DIST-AGOUZA"]);
      expect((await run({ sector: "REGIONAL" })).rows.map((row) => row.code)).toEqual(["CITY-ALEXANDRIA"]);
      expect((await run({ status: "unknown" })).rows.map((row) => row.code)).toEqual(["DIST-AGOUZA"]);
      expect((await run({ has_geometry: true })).rows.map((row) => row.code)).toEqual(["CITY-OBOUR"]);
      expect((await run({ has_geometry: false })).rows.map((row) => row.code)).toEqual(["CITY-ALEXANDRIA", "DIST-AGOUZA"]);
    } finally { await db.close(); }
  }, 60000);

  it("clamps an absurd page size instead of loading the table", async () => {
    const db = await migratedDatabase();
    try {
      await seedFixtures(db);
      const result = await listEntities({ page_size: 10_000 }, executor(db));
      expect(result.page_size).toBe(100);
    } finally { await db.close(); }
  }, 60000);
});

describe("BATCH 13 — fact review queue shows the whole case", () => {
  it("returns every linked evidence row with publisher, url and dates", async () => {
    const db = await migratedDatabase();
    try {
      await seedFixtures(db);
      const result = await listFactsForReview({ q: "OBOUR" }, executor(db));
      expect(result.total).toBe(3);
      const first = result.rows.find((row) => row.code === "F-OBOUR-1")!;
      expect(first.evidence).toHaveLength(1);
      expect(first.evidence[0]).toMatchObject({ code: "EV-OFFICIAL", source_type: "official", url: "https://example.gov.eg/report" });
      expect(first.review_state).toBe("pending");
      expect(first.verification_state).toBe("verified");
    } finally { await db.close(); }
  }, 60000);

  it("filters by review state, and pending includes never-reviewed facts", async () => {
    const db = await migratedDatabase();
    try {
      await seedFixtures(db);
      await db.query("INSERT INTO fact_reviews (fact_code, review_state, reviewer, reason) VALUES ('F-OBOUR-3','rejected','admin:abc','unsourced')");
      const pending = await listFactsForReview({ state: "pending", q: "OBOUR" }, executor(db));
      expect(pending.rows.map((row) => row.code).sort()).toEqual(["F-OBOUR-1", "F-OBOUR-2"]);
      const rejected = await listFactsForReview({ state: "rejected", q: "OBOUR" }, executor(db));
      expect(rejected.rows.map((row) => row.code)).toEqual(["F-OBOUR-3"]);
      expect(rejected.rows[0]!.review_reason).toBe("unsourced");
    } finally { await db.close(); }
  }, 60000);
});
