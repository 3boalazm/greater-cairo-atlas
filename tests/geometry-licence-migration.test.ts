import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("geometry licence vocabulary", () => {
  it("uses one allowed list for features and history", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE TABLE features (license text NOT NULL CONSTRAINT features_license_chk CHECK (license='ODbL'));
        CREATE TABLE geometry_history (license text NOT NULL CONSTRAINT geometry_history_license_check CHECK (license='ODbL-1.0'));`);
      await db.exec(await readFile("db/migrations/013_geometry_licences.sql", "utf8"));
      for (const license of ['ODbL', 'ODbL-1.0', 'CC-BY-4.0', 'CC-BY-IGO', 'CC0-1.0', 'official_gazette', 'custom_documented']) {
        await db.query('INSERT INTO features VALUES ($1)', [license]);
        await db.query('INSERT INTO geometry_history VALUES ($1)', [license]);
      }
      for (const table of ['features', 'geometry_history'])
        await expect(db.query(`INSERT INTO ${table} VALUES ('CC BY-IGO')`)).rejects.toThrow();
    } finally { await db.close(); }
  }, 30000);
});
