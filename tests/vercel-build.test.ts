import { describe, expect, it, vi } from "vitest";
import { executeVercelBuild } from "@/lib/db/vercel-build";
import type { Logger } from "@/lib/logger";

function createTestLogger() {
  const entries: Array<{
    level: string;
    message: string;
    context?: Record<string, unknown>;
  }> = [];

  const log: Logger = {
    debug(message, context) {
      entries.push({ level: "debug", message, context });
    },
    info(message, context) {
      entries.push({ level: "info", message, context });
    },
    warn(message, context) {
      entries.push({ level: "warn", message, context });
    },
    error(message, context) {
      entries.push({ level: "error", message, context });
    },
    child() {
      return log;
    },
  };

  return { log, entries };
}

describe("executeVercelBuild (build-time migration orchestration)", () => {
  it("skips migrations and runs next build when VERCEL is not '1'", async () => {
    const { log } = createTestLogger();
    const runMigrationsFn = vi.fn();
    const runNextBuildFn = vi.fn();

    const result = await executeVercelBuild({
      env: { NODE_ENV: "production" },
      log,
      runMigrationsFn,
      runNextBuildFn,
    });

    expect(result).toEqual({
      migrated: false,
      skipReason: "not_vercel",
    });
    expect(runMigrationsFn).not.toHaveBeenCalled();
    expect(runNextBuildFn).toHaveBeenCalledTimes(1);
  });

  it("logs a clear warning and still runs next build when VERCEL=1 but DATABASE_URL is missing", async () => {
    const { log, entries } = createTestLogger();
    const runMigrationsFn = vi.fn();
    const runNextBuildFn = vi.fn();

    const result = await executeVercelBuild({
      env: { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview" },
      log,
      runMigrationsFn,
      runNextBuildFn,
    });

    expect(result).toEqual({
      migrated: false,
      skipReason: "missing_database_url",
    });
    expect(runMigrationsFn).not.toHaveBeenCalled();
    expect(runNextBuildFn).toHaveBeenCalledTimes(1);
    expect(
      entries.some(
        (e) =>
          e.level === "warn" && e.message.includes("DATABASE_URL is missing"),
      ),
    ).toBe(true);
  });

  it("prefers DATABASE_URL_UNPOOLED over DATABASE_URL, runs migrations before next build, and never logs URLs", async () => {
    const { log, entries } = createTestLogger();
    const callOrder: string[] = [];

    const pooled =
      "postgresql://owner:topSecret111@ep-cairo-pooler.neon.tech/neondb?sslmode=require";
    const unpooled =
      "postgresql://owner:topSecret222@ep-cairo.neon.tech/neondb?sslmode=require";

    const result = await executeVercelBuild({
      env: {
        NODE_ENV: "production",
        VERCEL: "1",
        VERCEL_ENV: "production",
        DATABASE_URL: pooled,
        DATABASE_URL_UNPOOLED: unpooled,
      },
      log,
      runMigrationsFn: async () => {
        callOrder.push("migrate");
        return {
          dryRun: false,
          discovered: [],
          appliedNow: [
            "000_enable_postgis.sql",
            "001_core_schema.sql",
            "002_entity_taxonomy.sql",
          ],
          alreadyApplied: [],
        };
      },
      runNextBuildFn: () => {
        callOrder.push("next-build");
      },
    });

    expect(callOrder).toEqual(["migrate", "next-build"]);
    expect(result.migrated).toBe(true);
    expect(result.connectionSource).toBe("DATABASE_URL_UNPOOLED");

    const serializedLogs = JSON.stringify(entries);
    expect(serializedLogs).not.toContain("topSecret111");
    expect(serializedLogs).not.toContain("topSecret222");
    expect(serializedLogs).not.toContain("ep-cairo.neon.tech");
  });

  it("aborts before next build and redacts credentials if a migration fails", async () => {
    const { log, entries } = createTestLogger();
    const runNextBuildFn = vi.fn();

    const secretUrl =
      "postgresql://owner:ultraSecret999@ep-cairo.neon.tech/neondb?sslmode=require";

    await expect(
      executeVercelBuild({
        env: {
          NODE_ENV: "production",
          VERCEL: "1",
          DATABASE_URL: secretUrl,
        },
        log,
        runMigrationsFn: async () => {
          throw new Error(
            `Checksum mismatch while connected to ${secretUrl}`,
          );
        },
        runNextBuildFn,
      }),
    ).rejects.toThrow(/Checksum mismatch/);

    expect(runNextBuildFn).not.toHaveBeenCalled();

    const errorLogs = entries.filter((e) => e.level === "error");
    expect(errorLogs.length).toBeGreaterThan(0);
    expect(errorLogs[0]?.message).not.toContain("ultraSecret999");
    expect(errorLogs[0]?.message).toContain(
      "postgresql://[REDACTED]@ep-cairo.neon.tech",
    );
  });
});
