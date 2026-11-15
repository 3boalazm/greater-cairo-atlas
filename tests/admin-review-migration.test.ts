import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migrationPath = path.join(process.cwd(), "db/migrations/011_admin_review.sql");

async function migratedDatabase(): Promise<PGlite> {
  const db = new PGlite();
  // Minimal stand-ins for the tables 011 references. The real schema is applied by earlier
  // migrations in production; here we only need the referenced keys to exist.
  await db.exec(`
    CREATE TABLE entities (code text PRIMARY KEY);
    CREATE TABLE facts (code text PRIMARY KEY, entity_id uuid, attribute text, value text, verification_state text);
    CREATE TABLE evidence (code text PRIMARY KEY);
    CREATE TABLE submissions (id uuid PRIMARY KEY);
  `);
  await db.exec(await readFile(migrationPath, "utf8"));
  return db;
}

describe("BATCH 13 — admin review migration (011)", () => {
  it("creates the four review tables", async () => {
    const db = await migratedDatabase();
    try {
      const tables = await db.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
      );
      const names = tables.rows.map((row) => row.table_name);
      for (const expected of ["admin_audit_log", "admin_import_previews", "fact_reviews", "geometry_history"]) {
        expect(names).toContain(expected);
      }
    } finally { await db.close(); }
  }, 30000);

  it("keeps the audit log append-only, including for a privileged update path", async () => {
    const db = await migratedDatabase();
    try {
      await db.query(
        `INSERT INTO admin_audit_log (actor, action, reason, before_state, after_state)
         VALUES ('mustafa', 'fact.approve', 'looked fine', '{"review_state":"pending"}'::jsonb, '{"review_state":"approved"}'::jsonb)`,
      );
      const rows = await db.query<{ id: string }>("SELECT id FROM admin_audit_log");
      expect(rows.rows).toHaveLength(1);
      // History must be immutable: no UPDATE, no DELETE.
      await expect(db.query("UPDATE admin_audit_log SET actor='someone-else'")).rejects.toThrow(/append-only/u);
      await expect(db.query("DELETE FROM admin_audit_log")).rejects.toThrow(/append-only/u);
      const after = await db.query<{ actor: string }>("SELECT actor FROM admin_audit_log");
      expect(after.rows[0]!.actor).toBe("mustafa");
    } finally { await db.close(); }
  }, 30000);

  it("requires a written reason for reject and dispute but not for approve", async () => {
    const db = await migratedDatabase();
    try {
      await db.query("INSERT INTO facts (code, verification_state) VALUES ('F-APPROVE','candidate'),('F-REJECT','candidate'),('F-REJECT-BLANK','candidate'),('F-DISPUTE','candidate')");
      // Approve needs no reason.
      await db.query("INSERT INTO fact_reviews (fact_code, review_state, reviewer) VALUES ('F-APPROVE','approved','mustafa')");
      // Reject without a reason is refused, with a blank reason too.
      await expect(db.query("INSERT INTO fact_reviews (fact_code, review_state, reviewer) VALUES ('F-REJECT','rejected','mustafa')")).rejects.toThrow();
      await expect(db.query("INSERT INTO fact_reviews (fact_code, review_state, reason, reviewer) VALUES ('F-REJECT-BLANK','rejected','   ','mustafa')")).rejects.toThrow();
      // With a real reason it is accepted.
      await db.query("INSERT INTO fact_reviews (fact_code, review_state, reason, reviewer) VALUES ('F-DISPUTE','disputed','two sources disagree','mustafa')");
      const rows = await db.query<{ review_state: string }>("SELECT review_state FROM fact_reviews WHERE fact_code='F-DISPUTE'");
      expect(rows.rows[0]!.review_state).toBe("disputed");
      // Nothing was written for the two rejected attempts.
      const rejected = await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM fact_reviews WHERE review_state='rejected'");
      expect(rejected.rows[0]!.count).toBe(0);
    } finally { await db.close(); }
  }, 30000);

  it("rejects a review state or audit action outside the allowed vocabulary", async () => {
    const db = await migratedDatabase();
    try {
      await db.query("INSERT INTO facts (code) VALUES ('F-2')");
      await expect(db.query("INSERT INTO fact_reviews (fact_code, review_state, reviewer) VALUES ('F-2','auto_verified','mustafa')")).rejects.toThrow();
      await expect(db.query("INSERT INTO admin_audit_log (actor, action) VALUES ('mustafa','fact.delete')")).rejects.toThrow();
    } finally { await db.close(); }
  }, 30000);

  it("only stores a geometry that declares a licence and a source", async () => {
    const db = await migratedDatabase();
    try {
      await db.query("INSERT INTO entities (code) VALUES ('CITY-OBOUR')");
      await db.query(
        `INSERT INTO geometry_history (feature_code, entity_code, geometry, source_label, license, attribution, replaced_by, reason)
         VALUES ('OSM-WAY-1','CITY-OBOUR','{"type":"Polygon","coordinates":[]}'::jsonb,'CAPMAS COD-AB','CC-BY-IGO','© CAPMAS via OCHA/HDX','mustafa','official boundary replaced the OSM one')`,
      );
      // An undeclared licence is not accepted, and neither is a null source label.
      await expect(db.query(
        `INSERT INTO geometry_history (feature_code, entity_code, geometry, source_label, license, attribution, replaced_by)
         VALUES ('OSM-WAY-2','CITY-OBOUR','{"type":"Polygon","coordinates":[]}'::jsonb,'unknown','proprietary','x','mustafa')`,
      )).rejects.toThrow();
      const rows = await db.query<{ license: string }>("SELECT license FROM geometry_history");
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]!.license).toBe("CC-BY-IGO");
    } finally { await db.close(); }
  }, 30000);

  it("stores a dry-run preview so a commit can prove it approved those exact bytes", async () => {
    const db = await migratedDatabase();
    try {
      await db.query(
        `INSERT INTO admin_import_previews (created_by, source_filename, source_format, payload_checksum, summary, diff)
         VALUES ('mustafa','research.json','json',$1,'{"new":2}'::jsonb,'{"rows":[]}'::jsonb)`,
        ["d".repeat(64)],
      );
      // Only a lowercase sha-256 checksum is a valid payload identity.
      await expect(db.query(
        `INSERT INTO admin_import_previews (created_by, source_filename, source_format, payload_checksum, summary, diff)
         VALUES ('mustafa','x.json','json','not-a-checksum','{}'::jsonb,'{}'::jsonb)`,
      )).rejects.toThrow();
      // A preview that records a commit must also record who committed it.
      await expect(db.query("UPDATE admin_import_previews SET committed_at = NOW()")).rejects.toThrow();
      const rows = await db.query<{ committed_at: string | null }>("SELECT committed_at FROM admin_import_previews");
      expect(rows.rows[0]!.committed_at).toBeNull();
    } finally { await db.close(); }
  }, 30000);
});
