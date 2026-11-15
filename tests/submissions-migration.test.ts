import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

describe("submissions queue migration", () => {
  it("creates a constrained review queue separate from canonical facts", async () => {
    const db = new PGlite();
    try {
      await db.exec("CREATE TABLE entities (code text PRIMARY KEY); CREATE TABLE facts (code text PRIMARY KEY, value text NOT NULL);");
      await db.exec(await readFile(path.join(process.cwd(), "db/migrations/010_submissions.sql"), "utf8"));
      await db.query("INSERT INTO entities (code) VALUES ('ENTITY-1')");
      await db.query("INSERT INTO submissions (entity_code,attribute,proposed_value,source_url,request_fingerprint) VALUES ($1,$2,$3,$4,$5)", ["ENTITY-1", "operational_status", "planned", "https://example.org", "a".repeat(64)]);
      const rows = await db.query("SELECT status, reviewer_note, created_at FROM submissions");
      expect(rows.rows[0]).toMatchObject({ status: "pending", reviewer_note: null });
      expect((rows.rows[0] as { created_at: unknown }).created_at).toBeTruthy();
      await expect(db.query("INSERT INTO submissions (entity_code,attribute,proposed_value,source_url,request_fingerprint,status) VALUES ('ENTITY-1','x','y','https://example.org',$1,'auto_applied')", ["b".repeat(64)])).rejects.toThrow();
      await expect(db.query("INSERT INTO submissions (entity_code,attribute,proposed_value,source_url,request_fingerprint) VALUES ('UNKNOWN','x','y','https://example.org',$1)", ["c".repeat(64)])).rejects.toThrow();
      const facts = await db.query("SELECT COUNT(*)::int AS count FROM facts");
      expect((facts.rows[0] as { count: number }).count).toBe(0);
    } finally { await db.close(); }
  }, 30000);
});
