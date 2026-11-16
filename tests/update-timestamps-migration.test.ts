import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("updated_at triggers", () => {
  it("updates all three timestamps on mutation", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE FUNCTION set_updated_at_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
        CREATE TABLE entity_relations (value text, updated_at timestamptz DEFAULT '2000-01-01');
        CREATE TABLE submissions (value text, updated_at timestamptz DEFAULT '2000-01-01');
        CREATE TABLE fact_reviews (value text, updated_at timestamptz DEFAULT '2000-01-01');`);
      await db.exec(await readFile("db/migrations/014_update_timestamps.sql", "utf8"));
      for (const table of ['entity_relations', 'submissions', 'fact_reviews']) {
        await db.exec(`INSERT INTO ${table} (value) VALUES ('before'); UPDATE ${table} SET value='after'`);
        const result = await db.query<{ updated: boolean }>(`SELECT updated_at > '2000-01-01'::timestamptz AS updated FROM ${table}`);
        expect(result.rows[0]?.updated).toBe(true);
      }
    } finally { await db.close(); }
  }, 30000);
});
