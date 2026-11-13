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

describe("SQL migrations runner and migrations 000 + 001", () => {
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

  it("discovers 000_enable_postgis.sql and 001_core_schema.sql in order and verifies invariants", async () => {
    const migrations = await discoverMigrations();
    expect(migrations.map((m) => m.filename)).toEqual([
      "000_enable_postgis.sql",
      "001_core_schema.sql",
    ]);

    const m000 = migrations[0];
    expect(m000?.sql).toMatch(
      /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+postgis\s*;/i,
    );

    const m001 = migrations[1];
    expect(m001).toBeDefined();
    const sql001 = m001?.sql ?? "";

    // Core 4 tables + associative fact_evidence table
    expect(sql001).toMatch(/CREATE\s+TABLE\s+entities\b/i);
    expect(sql001).toMatch(/CREATE\s+TABLE\s+evidence\b/i);
    expect(sql001).toMatch(/CREATE\s+TABLE\s+facts\b/i);
    expect(sql001).toMatch(/CREATE\s+TABLE\s+features\b/i);
    expect(sql001).toMatch(/CREATE\s+TABLE\s+fact_evidence\b/i);

    // SRID 4326 geometry + GiST index + ON DELETE RESTRICT + updated_at triggers
    expect(sql001).toMatch(/geometry\s*\(\s*Geometry\s*,\s*4326\s*\)/i);
    expect(sql001).toMatch(/USING\s+GIST\s*\(\s*geometry\s*\)/i);
    expect(sql001).toMatch(/ON\s+DELETE\s+RESTRICT/i);
    expect(sql001).not.toMatch(/ON\s+DELETE\s+CASCADE/i);
    expect(sql001).toMatch(/trg_entities_set_updated_at/i);
    expect(sql001).toMatch(/trg_evidence_set_updated_at/i);
    expect(sql001).toMatch(/trg_facts_set_updated_at/i);
    expect(sql001).toMatch(/trg_features_set_updated_at/i);

    // Must NOT put a UNIQUE constraint or index on (entity_id, attribute)
    expect(sql001).not.toMatch(/UNIQUE\s*\(\s*entity_id\s*,\s*attribute\s*\)/i);
    expect(sql001).not.toMatch(
      /CREATE\s+UNIQUE\s+INDEX[^;]*\(\s*entity_id\s*,\s*attribute\s*\)/i,
    );
  });

  it("runs dry-run without requiring DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    const summary = await runMigrations({ dryRun: true });
    expect(summary.dryRun).toBe(true);
    expect(summary.discovered.map((m) => m.filename)).toEqual([
      "000_enable_postgis.sql",
      "001_core_schema.sql",
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
