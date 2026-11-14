import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/admin/import-seed/route";
import { executeAdminSeedImport } from "@/lib/atlas/admin-import";
import type { SeedDbSession } from "@/lib/atlas/seed";

describe("POST /api/admin/import-seed protected seed import endpoint", () => {
  const originalAdminToken = process.env.ADMIN_IMPORT_TOKEN;
  const originalDbUrl = process.env.DATABASE_URL;
  const validToken = "test-admin-import-token-32-chars-minimum!!";
  const fixtureDir = path.resolve(process.cwd(), "tests/fixtures/seed-valid");

  afterEach(() => {
    if (originalAdminToken === undefined) {
      delete process.env.ADMIN_IMPORT_TOKEN;
    } else {
      process.env.ADMIN_IMPORT_TOKEN = originalAdminToken;
    }
    if (originalDbUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDbUrl;
    }
  });

  it("fails closed with 503 when ADMIN_IMPORT_TOKEN is not configured", async () => {
    delete process.env.ADMIN_IMPORT_TOKEN;

    const req = new Request("https://example.vercel.app/api/admin/import-seed", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${validToken}`,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("ADMIN_IMPORT_NOT_CONFIGURED");
  });

  it("rejects missing or invalid tokens with 401 and WWW-Authenticate header", async () => {
    process.env.ADMIN_IMPORT_TOKEN = validToken;

    const missingHeaderRes = await POST(
      new Request("https://example.vercel.app/api/admin/import-seed", {
        method: "POST",
      }),
    );
    expect(missingHeaderRes.status).toBe(401);
    expect(missingHeaderRes.headers.get("WWW-Authenticate")).toContain("Bearer");

    const wrongTokenRes = await POST(
      new Request("https://example.vercel.app/api/admin/import-seed", {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-token-value-1234567890",
        },
      }),
    );
    expect(wrongTokenRes.status).toBe(401);
    const body = await wrongTokenRes.json();
    expect(body.error.code).toBe("ADMIN_UNAUTHORIZED");
  });

  it("rejects tokens passed in URL query string with 400 so secrets never leak into URLs", async () => {
    process.env.ADMIN_IMPORT_TOKEN = validToken;

    const res = await POST(
      new Request(
        `https://example.vercel.app/api/admin/import-seed?token=${encodeURIComponent(validToken)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        },
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("REQUEST_VALIDATION_ERROR");
  });

  it("defaults to dryRun=true without requiring DATABASE_URL and returns full validation report", async () => {
    process.env.ADMIN_IMPORT_TOKEN = validToken;
    delete process.env.DATABASE_URL;

    const res = await POST(
      new Request("https://example.vercel.app/api/admin/import-seed", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.mode).toBe("dry_run");
    expect(payload.dryRun).toBe(true);
    expect(payload.summary).toEqual({
      entitiesCount: 342,
      evidenceCount: 307,
      factsCount: 1301,
      factEvidenceLinksCount: 1411,
      featuresCount: 3615,
    });
    expect(payload.report.evidenceMissingUrlCount).toBe(74);
    expect(payload.report.unresolvedOfficialEvidenceCount).toBe(2);
    expect(payload.report.unresolvedOfficialEvidenceCodes).toEqual([
      "EV-045",
      "EV-046",
    ]);
    expect(payload.report.warnings).toHaveLength(74);
    expect(
      payload.report.warnings
        .filter((warning: { code: string }) => warning.code === "OFFICIAL_SOURCE_MISSING_URL")
        .map((warning: { path: string }) => warning.path.match(/EV-\d+/)?.[0]),
    ).toEqual(["EV-045", "EV-046"]);
    expect(payload.report.breakdowns.entitiesBySector.REGIONAL).toBe(28);
    expect(payload.report.breakdowns.factsByVerificationState.verified).toBe(310);
    expect(JSON.stringify(payload)).not.toContain(validToken);
  });

  it("executes idempotent upsert when dryRun=false is explicitly requested", async () => {
    let uuidCounter = 1;
    const nextUuid = () =>
      `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`;

    const entityIds = new Map<string, string>();
    const evidenceIds = new Map<string, string>();
    const factIds = new Map<string, string>();
    const links = new Set<string>();

    const createSession = (): SeedDbSession => ({
      async connect() {},
      async query<Row = Record<string, unknown>>(
        text: string,
        values?: unknown[],
      ) {
        const sql = text.trim();
        if (sql.startsWith("INSERT INTO entities") && values) {
          const code = String(values[0]);
          const id = entityIds.get(code) ?? nextUuid();
          entityIds.set(code, id);
          return { rows: [{ id, code }] as unknown as Row[] };
        }
        if (sql.startsWith("INSERT INTO evidence") && values) {
          const code = String(values[0]);
          const id = evidenceIds.get(code) ?? nextUuid();
          evidenceIds.set(code, id);
          return { rows: [{ id, code }] as unknown as Row[] };
        }
        if (sql.startsWith("INSERT INTO facts") && values) {
          const code = String(values[0]);
          const id = factIds.get(code) ?? nextUuid();
          factIds.set(code, id);
          return { rows: [{ id, code }] as unknown as Row[] };
        }
        if (sql.startsWith("INSERT INTO fact_evidence") && values) {
          links.add(`${String(values[0])}:${String(values[1])}`);
          return { rows: [] };
        }
        return { rows: [] };
      },
      async end() {},
    });

    const makeImportRequest = () =>
      new Request("https://example.vercel.app/api/admin/import-seed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-import-token": validToken,
        },
        body: JSON.stringify({ dryRun: false }),
      });

    const first = await executeAdminSeedImport({
      request: makeImportRequest(),
      rawEnv: { NODE_ENV: "test", ADMIN_IMPORT_TOKEN: validToken },
      seedDir: fixtureDir,
      sessionFactory: createSession,
    });
    const second = await executeAdminSeedImport({
      request: makeImportRequest(),
      rawEnv: { NODE_ENV: "test", ADMIN_IMPORT_TOKEN: validToken },
      seedDir: fixtureDir,
      sessionFactory: createSession,
    });

    expect(first.mode).toBe("import");
    expect(first.dryRun).toBe(false);
    expect(second.summary).toEqual({
      entitiesCount: 5,
      evidenceCount: 4,
      factsCount: 5,
      factEvidenceLinksCount: 7,
      featuresCount: 0,
    });
    expect(entityIds.size).toBe(5);
    expect(evidenceIds.size).toBe(4);
    expect(factIds.size).toBe(5);
    expect(links.size).toBe(7);
  });
});
