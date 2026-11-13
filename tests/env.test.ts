import { describe, expect, it } from "vitest";
import { getRuntimeEnv, requireDatabaseEnv } from "@/lib/env";
import { DatabaseNotConfiguredError, EnvValidationError } from "@/lib/errors";

describe("environment validation", () => {
  it("throws DatabaseNotConfiguredError with clear message when DATABASE_URL is missing", () => {
    expect(() => requireDatabaseEnv({ NODE_ENV: "test" })).toThrowError(
      DatabaseNotConfiguredError,
    );

    try {
      requireDatabaseEnv({ NODE_ENV: "test" });
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseNotConfiguredError);
      const dbErr = error as DatabaseNotConfiguredError;
      expect(dbErr.code).toBe("DATABASE_NOT_CONFIGURED");
      expect(dbErr.statusCode).toBe(503);
      expect(dbErr.message).toContain("DATABASE_URL is missing");
      expect(dbErr.issues?.[0]?.path).toBe("DATABASE_URL");
    }
  });

  it("throws DatabaseNotConfiguredError when DATABASE_URL is blank whitespace", () => {
    expect(() =>
      requireDatabaseEnv({ NODE_ENV: "test", DATABASE_URL: "   " }),
    ).toThrowError(DatabaseNotConfiguredError);
  });

  it("throws EnvValidationError when DATABASE_URL is non-empty but not a postgres URL", () => {
    expect(() =>
      requireDatabaseEnv({
        NODE_ENV: "test",
        DATABASE_URL: "https://example.com/db",
      }),
    ).toThrowError(EnvValidationError);

    expect(() =>
      requireDatabaseEnv({
        NODE_ENV: "test",
        DATABASE_URL: "not-a-valid-connection-string",
      }),
    ).toThrowError(EnvValidationError);
  });

  it("accepts valid postgresql:// and postgres:// connection strings", () => {
    const neonUrl =
      "postgresql://atlas_owner:secret@ep-cairo-pooler.eu-central-1.aws.neon.tech/cairo_atlas?sslmode=require";
    const result = requireDatabaseEnv({
      NODE_ENV: "test",
      DATABASE_URL: `  ${neonUrl}  `,
    });

    expect(result.DATABASE_URL).toBe(neonUrl);
  });

  it("validates runtime environment defaults and rejects invalid LOG_LEVEL", () => {
    const defaults = getRuntimeEnv({} as NodeJS.ProcessEnv);
    expect(defaults.NODE_ENV).toBe("development");
    expect(defaults.LOG_LEVEL).toBeUndefined();

    expect(() =>
      getRuntimeEnv({
        NODE_ENV: "development",
        LOG_LEVEL: "verbose",
      }),
    ).toThrowError(EnvValidationError);
  });
});
