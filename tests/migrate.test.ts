import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeMigrationChecksum,
  discoverMigrations,
  runMigrations,
  type AppliedMigrationRecord,
  type MigrationDbSession,
} from "@/lib/db/migrate";
import { DatabaseNotConfiguredError, MigrationError } from "@/lib/errors";

describe("SQL migrations runner and migrations 000 through 004", () => {
  const tempDirs: string[] = [];
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(async () => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  async function makeTempMigrationsDir(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cairo-atlas-migrations-"));
    tempDirs.push(dir);
    return dir;
  }

  it("discovers migrations 000-004 in order, preserving immutable prior checksums and feature invariants", async () => {
    const migrations = await discoverMigrations();
    expect(migrations.map((m) => m.filename)).toEqual([
      "000_enable_postgis.sql",
      "001_core_schema.sql",
      "002_entity_taxonomy.sql",
      "003_research_seed_extensions.sql",
      "004_feature_bbox_attribution.sql",
    ]);

    const m000 = migrations[0];
    expect(m000?.checksum.slice(0, 12)).toBe("b573d40e4c3a");
    expect(m000?.sql).toMatch(
      /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+postgis\s*;/i,
    );

    // 001_core_schema.sql checksum must never change
    const m001 = migrations[1];
    expect(m001?.checksum.slice(0, 12)).toBe("664d66c189da");
    const sql001 = m001?.sql ?? "";
    expect(sql001).toMatch(/CREATE\s+TABLE\s+entities\b/i);
    expect(sql001).toMatch(/CREATE\s+TABLE\s+evidence\b/i);
    expect(sql001).toMatch(/CREATE\s+TABLE\s+facts\b/i);
    expect(sql001).toMatch(/CREATE\s+TABLE\s+features\b/i);
    expect(sql001).toMatch(/CREATE\s+TABLE\s+fact_evidence\b/i);
    expect(sql001).not.toMatch(/UNIQUE\s*\(\s*entity_id\s*,\s*attribute\s*\)/i);

    // 002_entity_taxonomy.sql checksum must also never change
    const m002 = migrations[2];
    expect(m002?.checksum.slice(0, 12)).toBe("c82d6e710bed");
    const sql002 = m002?.sql ?? "";
    expect(sql002).toContain("'secondary'");
    expect(sql002).toMatch(/DEFERRABLE\s+INITIALLY\s+DEFERRED/i);
    expect(sql002).toMatch(/assert_fact_verified_has_primary_source/i);

    // 003_research_seed_extensions.sql extends sector, entity_type, aliases, and date precision
    const m003 = migrations[3];
    expect(m003).toBeDefined();
    const sql003 = m003?.sql ?? "";
    expect(sql003).toContain("'REGIONAL'");
    expect(sql003).toContain("'airport'");
    expect(sql003).toContain("'rail_station'");
    expect(sql003).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+aliases\s+TEXT\[\]/i);
    expect(sql003).toMatch(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+valid_as_of_precision\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'day'/i,
    );
    expect(sql003).toMatch(
      /valid_as_of_precision\s+IN\s*\(\s*'day'\s*,\s*'month'\s*,\s*'year'\s*\)/i,
    );
    expect(sql003).toMatch(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+published_date_precision\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'day'/i,
    );
    expect(sql003).toMatch(/evidence_locator_or_title_chk/i);

    const m004 = migrations[4];
    expect(m004?.filename).toBe("004_feature_bbox_attribution.sql");
    expect(m004?.sql).toMatch(/features_greater_cairo_bbox_chk/i);
    expect(m004?.sql).toMatch(/features_provenance_metadata_chk/i);
    expect(m004?.sql).toContain("30.5");
    expect(m004?.sql).toContain("32.1");
  });

  it("runs dry-run without requiring DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    const summary = await runMigrations({ dryRun: true });
    expect(summary.dryRun).toBe(true);
    expect(summary.discovered.map((m) => m.filename)).toEqual([
      "000_enable_postgis.sql",
      "001_core_schema.sql",
      "002_entity_taxonomy.sql",
      "003_research_seed_extensions.sql",
      "004_feature_bbox_attribution.sql",
    ]);
  });

  it("fails clearly with DatabaseNotConfiguredError when live migration runs without DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    await expect(runMigrations({ dryRun: false })).rejects.toBeInstanceOf(
      DatabaseNotConfiguredError,
    );
  });

  it("rejects invalid migration filenames and duplicate numeric prefixes", async () => {
    const badNameDir = await makeTempMigrationsDir();
    await writeFile(
      path.join(badNameDir, "enable_postgis.sql"),
      "CREATE EXTENSION IF NOT EXISTS postgis;",
    );
    await expect(discoverMigrations(badNameDir)).rejects.toBeInstanceOf(
      MigrationError,
    );

    const dupDir = await makeTempMigrationsDir();
    await writeFile(path.join(dupDir, "000_first.sql"), "SELECT 1;");
    await writeFile(path.join(dupDir, "000_second.sql"), "SELECT 2;");
    await expect(discoverMigrations(dupDir)).rejects.toThrow(
      /Duplicate migration version/,
    );
  });

  it("applies pending migrations transactionally, skips applied ones, and detects checksum drift", async () => {
    const dir = await makeTempMigrationsDir();
    const sql000 = "CREATE EXTENSION IF NOT EXISTS postgis;\n";
    const sql001 = "SELECT 1;\n";

    await writeFile(path.join(dir, "000_enable_postgis.sql"), sql000);
    await writeFile(path.join(dir, "001_smoke.sql"), sql001);

    const recordedRows: AppliedMigrationRecord[] = [
      {
        version: "000",
        name: "enable_postgis",
        checksum: computeMigrationChecksum(sql000),
        applied_at: new Date().toISOString(),
      },
    ];
    const executedSql: string[] = [];

    const mockSession: MigrationDbSession = {
      async connect() {},
      async query<Row = Record<string, unknown>>(
        text: string,
        values?: unknown[],
      ) {
        executedSql.push(text.trim());
        if (text.includes("FROM schema_migrations")) {
          return { rows: recordedRows as unknown as Row[] };
        }
        if (text.startsWith("INSERT INTO schema_migrations") && values) {
          recordedRows.push({
            version: String(values[0]),
            name: String(values[1]),
            checksum: String(values[2]),
            applied_at: new Date().toISOString(),
          });
        }
        return { rows: [] };
      },
      async end() {},
    };

    const summary = await runMigrations({
      migrationsDir: dir,
      sessionFactory: () => mockSession,
    });

    expect(summary.alreadyApplied).toEqual(["000_enable_postgis.sql"]);
    expect(summary.appliedNow).toEqual(["001_smoke.sql"]);
    expect(executedSql).toContain("BEGIN");
    expect(executedSql).toContain("SELECT 1;");
    expect(executedSql).toContain("COMMIT");

    await writeFile(
      path.join(dir, "000_enable_postgis.sql"),
      "CREATE EXTENSION postgis CASCADE;\n",
    );

    await expect(
      runMigrations({
        migrationsDir: dir,
        sessionFactory: () => mockSession,
      }),
    ).rejects.toThrow(/Checksum mismatch/);
  });

  it("rolls back transaction when a migration SQL statement fails", async () => {
    const dir = await makeTempMigrationsDir();
    await writeFile(path.join(dir, "000_broken.sql"), "INVALID SQL;");

    const executedSql: string[] = [];
    const failingSession: MigrationDbSession = {
      async connect() {},
      async query<Row = Record<string, unknown>>(text: string) {
        executedSql.push(text.trim());
        if (text.trim() === "INVALID SQL;") {
          throw new Error("syntax error at or near INVALID");
        }
        return { rows: [] as Row[] };
      },
      async end() {},
    };

    await expect(
      runMigrations({
        migrationsDir: dir,
        sessionFactory: () => failingSession,
      }),
    ).rejects.toBeInstanceOf(MigrationError);

    expect(executedSql).toContain("BEGIN");
    expect(executedSql).toContain("ROLLBACK");
  });
});
