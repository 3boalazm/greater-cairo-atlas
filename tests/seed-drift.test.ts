import { PGlite } from "@electric-sql/pglite";
import { describe, it, expect } from "vitest";
import { getSeedDriftCodes } from "@/lib/atlas/drift";

describe("database-only seed drift", () => {
  it("reports only sorted codes for each table", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE TABLE entities (code text); CREATE TABLE facts (code text); CREATE TABLE evidence (code text);
        INSERT INTO entities VALUES ('ENTITY-SEED'),('ENTITY-Z'),('ENTITY-A');
        INSERT INTO facts VALUES ('FACT-SEED'),('FACT-RETIRED');
        INSERT INTO evidence VALUES ('EVIDENCE-ONLY');`);
      const drift = await getSeedDriftCodes(async (text, values) => (await db.query<{ code: string }>(text, values)).rows,
        { entities: [{ code: "ENTITY-SEED" }], facts: [{ code: "FACT-SEED" }], evidence: [] });
      expect(drift).toEqual({ entities: ["ENTITY-A", "ENTITY-Z"], facts: ["FACT-RETIRED"], evidence: ["EVIDENCE-ONLY"] });
    } finally { await db.close(); }
  }, 30000);
});
