import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/atlas/stats/route";
import { getAtlasTableStats } from "@/lib/atlas/stats";

describe("GET /api/atlas/stats and table count queries", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("returns HTTP 503 not_configured when DATABASE_URL is absent", async () => {
    delete process.env.DATABASE_URL;

    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.status).toBe("not_configured");
    expect(body.error.code).toBe("DATABASE_NOT_CONFIGURED");
  });

  it("returns HTTP 200 with zero counts when tables exist and are empty", async () => {
    const outcome = await getAtlasTableStats(async () => [
      {
        entities: 0,
        facts: 0,
        evidence: 0,
        features: 0,
        fact_evidence: 0,
      },
    ]);

    expect(outcome.httpStatus).toBe(200);
    expect(outcome.body.ok).toBe(true);
    if (outcome.body.ok) {
      expect(outcome.body.counts).toEqual({
        entities: 0,
        facts: 0,
        evidence: 0,
        features: 0,
        fact_evidence: 0,
      });
    }
  });

  it("returns HTTP 200 with populated counts including numeric strings from PG drivers", async () => {
    const outcome = await getAtlasTableStats(async () => [
      {
        entities: "4",
        facts: "5",
        evidence: "3",
        features: "2",
        fact_evidence: "6",
      },
    ]);

    expect(outcome.httpStatus).toBe(200);
    expect(outcome.body.ok).toBe(true);
    if (outcome.body.ok) {
      expect(outcome.body.counts).toEqual({
        entities: 4,
        facts: 5,
        evidence: 3,
        features: 2,
        fact_evidence: 6,
      });
    }
  });

  it("returns HTTP 503 SCHEMA_NOT_MIGRATED when core tables do not exist yet (PG code 42P01)", async () => {
    const missingTableError = Object.assign(
      new Error('relation "entities" does not exist'),
      { code: "42P01" },
    );

    const outcome = await getAtlasTableStats(async () => {
      throw missingTableError;
    });

    expect(outcome.httpStatus).toBe(503);
    expect(outcome.body.ok).toBe(false);
    if (!outcome.body.ok) {
      expect(outcome.body.status).toBe("schema_not_migrated");
      expect(outcome.body.error.code).toBe("SCHEMA_NOT_MIGRATED");
    }
  });
});
