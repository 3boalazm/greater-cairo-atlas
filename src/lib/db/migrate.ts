import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createNeonSessionClient } from "@/lib/db/client";
import { MigrationError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const MIGRATION_FILENAME_PATTERN = /^(\d{3})_([a-z0-9_]+)\.sql$/;
const MIGRATION_ADVISORY_LOCK_KEY = 72940131;

export interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  fullPath: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigrationRecord {
  version: string;
  name: string;
  checksum: string;
  applied_at: string | Date;
}

export interface MigrationDbSession {
  connect(): Promise<void>;
  query<Row = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
  end(): Promise<void>;
}

export interface RunMigrationsOptions {
  migrationsDir?: string;
  dryRun?: boolean;
  env?: NodeJS.ProcessEnv;
  sessionFactory?: () => MigrationDbSession;
}

export interface RunMigrationsSummary {
  dryRun: boolean;
  discovered: MigrationFile[];
  appliedNow: string[];
  alreadyApplied: string[];
}

export function computeMigrationChecksum(sqlContent: string): string {
  const normalized = sqlContent.replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

export async function discoverMigrations(
  migrationsDir = path.resolve(process.cwd(), "db/migrations"),
): Promise<MigrationFile[]> {
  let entries;
  try {
    entries = await readdir(migrationsDir, { withFileTypes: true });
  } catch (error) {
    throw new MigrationError(
      `Cannot read migrations directory at ${migrationsDir}`,
      error,
    );
  }

  const migrations: MigrationFile[] = [];
  const seenVersions = new Map<string, string>();

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const match = MIGRATION_FILENAME_PATTERN.exec(entry.name);
    if (!match) {
      throw new MigrationError(
        `Invalid migration filename "${entry.name}". Expected NNN_snake_case_description.sql (e.g. 000_enable_postgis.sql).`,
      );
    }

    const version = match[1];
    const name = match[2];
    if (!version || !name) {
      throw new MigrationError(`Invalid migration filename "${entry.name}".`);
    }

    const existingFilename = seenVersions.get(version);
    if (existingFilename) {
      throw new MigrationError(
        `Duplicate migration version "${version}" found in "${existingFilename}" and "${entry.name}".`,
      );
    }
    seenVersions.set(version, entry.name);

    const fullPath = path.join(migrationsDir, entry.name);
    const sql = await readFile(fullPath, "utf8");

    if (stripSqlComments(sql).length === 0) {
      throw new MigrationError(
        `Migration file "${entry.name}" contains no executable SQL statements.`,
      );
    }

    migrations.push({
      version,
      name,
      filename: entry.name,
      fullPath,
      sql,
      checksum: computeMigrationChecksum(sql),
    });
  }

  migrations.sort((a, b) => a.version.localeCompare(b.version));
  return migrations;
}

const createDefaultSessionFactory =
  (rawEnv: NodeJS.ProcessEnv = process.env) =>
  (): MigrationDbSession => {
    const client = createNeonSessionClient(rawEnv);
    return {
      async connect() {
        await client.connect();
      },
      async query<Row = Record<string, unknown>>(
        text: string,
        values?: unknown[],
      ) {
        const result = values
          ? await client.query(text, values)
          : await client.query(text);
        return { rows: result.rows as Row[] };
      },
      async end() {
        await client.end();
      },
    };
  };

export async function runMigrations(
  options: RunMigrationsOptions = {},
): Promise<RunMigrationsSummary> {
  const migrationsDir =
    options.migrationsDir ?? path.resolve(process.cwd(), "db/migrations");
  const dryRun = options.dryRun ?? false;
  const discovered = await discoverMigrations(migrationsDir);

  if (dryRun) {
    logger.info("Validated SQL migrations in dry-run mode", {
      count: discovered.length,
      migrations: discovered.map((m) => ({
        filename: m.filename,
        checksum: m.checksum.slice(0, 12),
      })),
    });
    return {
      dryRun: true,
      discovered,
      appliedNow: [],
      alreadyApplied: [],
    };
  }

  const createSession =
    options.sessionFactory ?? createDefaultSessionFactory(options.env);
  const session = createSession();
  let lockAcquired = false;

  await session.connect();

  try {
    await session.query("SELECT pg_advisory_lock($1)", [
      MIGRATION_ADVISORY_LOCK_KEY,
    ]);
    lockAcquired = true;

    await session.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const existingResult = await session.query<AppliedMigrationRecord>(`
      SELECT version, name, checksum, applied_at
      FROM schema_migrations
      ORDER BY version ASC;
    `);

    const appliedByVersion = new Map<string, AppliedMigrationRecord>();
    for (const row of existingResult.rows) {
      appliedByVersion.set(row.version, row);
    }

    const alreadyApplied: string[] = [];
    const appliedNow: string[] = [];

    for (const migration of discovered) {
      const recorded = appliedByVersion.get(migration.version);
      if (recorded) {
        if (recorded.checksum !== migration.checksum) {
          throw new MigrationError(
            `Checksum mismatch for already-applied migration "${migration.filename}" (expected ${recorded.checksum}, found ${migration.checksum}). Applied migrations are immutable.`,
          );
        }
        alreadyApplied.push(migration.filename);
        continue;
      }

      logger.info(`Applying migration ${migration.filename}`);
      await session.query("BEGIN");
      try {
        await session.query(migration.sql);
        await session.query(
          `INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)`,
          [migration.version, migration.name, migration.checksum],
        );
        await session.query("COMMIT");
        appliedNow.push(migration.filename);
        logger.info(`Applied migration ${migration.filename}`);
      } catch (error) {
        await session.query("ROLLBACK").catch(() => undefined);
        throw new MigrationError(
          `Failed applying migration "${migration.filename}": ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      }
    }

    return {
      dryRun: false,
      discovered,
      appliedNow,
      alreadyApplied,
    };
  } finally {
    if (lockAcquired) {
      await session
        .query("SELECT pg_advisory_unlock($1)", [MIGRATION_ADVISORY_LOCK_KEY])
        .catch(() => undefined);
    }
    await session.end().catch(() => undefined);
  }
}
