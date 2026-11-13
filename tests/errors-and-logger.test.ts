import { describe, expect, it } from "vitest";
import {
  AppError,
  redactSecrets,
  toApiErrorResponse,
} from "@/lib/errors";
import { sanitizeLogValue } from "@/lib/logger";

describe("secret redaction, error normalization, and log sanitization", () => {
  it("redacts credentials from embedded PostgreSQL URLs while preserving doc placeholders", () => {
    const raw =
      "Connection failed for postgresql://owner:mySuperSecretPass123@ep-cool-sky.neon.tech/neondb?sslmode=require";
    const sanitized = redactSecrets(raw);

    expect(sanitized).not.toContain("mySuperSecretPass123");
    expect(sanitized).toContain("postgresql://[REDACTED]@ep-cool-sky.neon.tech");
    expect(redactSecrets("Expected format (postgresql://...)")).toBe(
      "Expected format (postgresql://...)",
    );
  });

  it("redacts sensitive keys and nested Error credentials in log metadata", () => {
    const sanitized = sanitizeLogValue({
      DATABASE_URL: "postgresql://user:topsecret@ep-host.neon.tech/db",
      ADMIN_IMPORT_TOKEN: "super-secret-admin-import-token-123456",
      password: "plain-password",
      nested: {
        error: new Error(
          "Neon failure on postgres://admin:pw999@ep-host.neon.tech/db",
        ),
      },
      safeField: "greater-cairo-atlas",
    }) as Record<string, unknown>;

    expect(sanitized.DATABASE_URL).toBe("[REDACTED]");
    expect(sanitized.ADMIN_IMPORT_TOKEN).toBe("[REDACTED]");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.safeField).toBe("greater-cairo-atlas");

    const nested = sanitized.nested as { error: { message: string } };
    expect(nested.error.message).not.toContain("pw999");
    expect(nested.error.message).toContain("postgres://[REDACTED]@ep-host.neon.tech");
  });

  it("hides internal error messages when expose is false in toApiErrorResponse", async () => {
    const internalError = new AppError("Internal SQL execution details", {
      code: "INTERNAL_DB_FAILURE",
      statusCode: 500,
      expose: false,
    });

    const response = toApiErrorResponse(internalError);
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");

    const payload = await response.json();
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("INTERNAL_DB_FAILURE");
    expect(payload.error.message).toBe("An internal server error occurred.");
  });
});
