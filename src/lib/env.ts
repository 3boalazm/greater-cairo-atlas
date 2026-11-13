import { z } from "zod";
import {
  DatabaseNotConfiguredError,
  EnvValidationError,
  type ValidationIssueDetail,
} from "@/lib/errors";

const MISSING_DATABASE_URL_MESSAGE =
  "DATABASE_URL is missing. Set a Neon PostgreSQL connection string (postgresql://...) in .env.local or Vercel Environment Variables.";

function isValidPostgresConnectionUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "postgres:" || parsed.protocol === "postgresql:") &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}

export const runtimeEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error", "silent"])
    .optional(),
  VERCEL_ENV: z
    .enum(["production", "preview", "development"])
    .optional(),
});

export const databaseEnvSchema = z.object({
  DATABASE_URL: z
    .string({
      error: MISSING_DATABASE_URL_MESSAGE,
    })
    .trim()
    .min(1, {
      error: MISSING_DATABASE_URL_MESSAGE,
    })
    .refine(isValidPostgresConnectionUrl, {
      error:
        "DATABASE_URL must be a valid PostgreSQL connection string starting with postgres:// or postgresql:// and containing a host.",
    }),
});

const unpooledDatabaseEnvSchema = z.object({
  DATABASE_URL_UNPOOLED: z
    .string()
    .trim()
    .min(1)
    .refine(isValidPostgresConnectionUrl, {
      error:
        "DATABASE_URL_UNPOOLED must be a valid PostgreSQL connection string starting with postgres:// or postgresql:// and containing a host.",
    }),
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

export interface MigrationDatabaseEnv {
  connectionString: string;
  source: "DATABASE_URL_UNPOOLED" | "DATABASE_URL";
}

function formatZodIssues(issues: z.core.$ZodIssue[]): ValidationIssueDetail[] {
  return issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "env",
    message: issue.message,
  }));
}

/**
 * Validates non-database runtime environment variables.
 * Safe to call during build, render, and serverless cold starts without a live DB.
 */
export function getRuntimeEnv(
  rawEnv: NodeJS.ProcessEnv = process.env,
): RuntimeEnv {
  const parsed = runtimeEnvSchema.safeParse({
    NODE_ENV: rawEnv.NODE_ENV,
    LOG_LEVEL: rawEnv.LOG_LEVEL || undefined,
    VERCEL_ENV: rawEnv.VERCEL_ENV || undefined,
  });

  if (!parsed.success) {
    const issues = formatZodIssues(parsed.error.issues);
    throw new EnvValidationError(
      `Invalid runtime environment configuration: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
      issues,
    );
  }

  return parsed.data;
}

/**
 * Validates and returns DATABASE_URL strictly from environment variables.
 * Throws DatabaseNotConfiguredError (HTTP 503) when DATABASE_URL is absent/blank,
 * or EnvValidationError (HTTP 500) when DATABASE_URL is present but malformed.
 */
export function requireDatabaseEnv(
  rawEnv: NodeJS.ProcessEnv = process.env,
): DatabaseEnv {
  const rawDatabaseUrl = rawEnv.DATABASE_URL;
  const isMissingOrBlank =
    rawDatabaseUrl === undefined || rawDatabaseUrl.trim().length === 0;

  const parsed = databaseEnvSchema.safeParse({
    DATABASE_URL: rawDatabaseUrl,
  });

  if (!parsed.success) {
    const issues = formatZodIssues(parsed.error.issues);

    if (isMissingOrBlank) {
      throw new DatabaseNotConfiguredError(
        "Database connection is not configured: DATABASE_URL is missing. Provision a Neon PostgreSQL database, run migrations (npm run db:migrate), and set DATABASE_URL.",
        issues,
      );
    }

    throw new EnvValidationError(
      `Invalid database environment configuration: ${issues.map((i) => i.message).join("; ")}`,
      issues,
    );
  }

  return parsed.data;
}

/**
 * Resolves the PostgreSQL connection string for session-stateful workloads
 * (migrations with pg_advisory_lock and multi-statement transactions).
 *
 * Neon's PgBouncer pooled URL can interfere with session-scoped advisory locks;
 * therefore DATABASE_URL_UNPOOLED (injected automatically by the Neon Vercel
 * integration) is preferred whenever present, falling back to DATABASE_URL.
 */
export function requireMigrationDatabaseEnv(
  rawEnv: NodeJS.ProcessEnv = process.env,
): MigrationDatabaseEnv {
  const rawUnpooled = rawEnv.DATABASE_URL_UNPOOLED;
  if (rawUnpooled !== undefined && rawUnpooled.trim().length > 0) {
    const parsedUnpooled = unpooledDatabaseEnvSchema.safeParse({
      DATABASE_URL_UNPOOLED: rawUnpooled,
    });
    if (!parsedUnpooled.success) {
      const issues = formatZodIssues(parsedUnpooled.error.issues);
      throw new EnvValidationError(
        `Invalid unpooled database environment configuration: ${issues.map((i) => i.message).join("; ")}`,
        issues,
      );
    }
    return {
      connectionString: parsedUnpooled.data.DATABASE_URL_UNPOOLED,
      source: "DATABASE_URL_UNPOOLED",
    };
  }

  const { DATABASE_URL } = requireDatabaseEnv(rawEnv);
  return {
    connectionString: DATABASE_URL,
    source: "DATABASE_URL",
  };
}
