import { NextResponse } from "next/server";

export interface ValidationIssueDetail {
  path: string;
  message: string;
}

const POSTGRES_URI_PATTERN =
  /\bpostgres(?:ql)?:\/\/(?![.]{3})[^\s"'`<>)]+/gi;

/**
 * Redacts PostgreSQL connection strings so credentials or host tokens
 * never leak into logs or error payloads.
 */
export function redactSecrets(input: string): string {
  return input.replace(POSTGRES_URI_PATTERN, (match) => {
    try {
      const parsed = new URL(match);
      return `${parsed.protocol}//[REDACTED]@${parsed.hostname}`;
    } catch {
      return "postgresql://[REDACTED]";
    }
  });
}

export interface AppErrorOptions {
  code: string;
  statusCode: number;
  expose?: boolean;
  issues?: ValidationIssueDetail[];
  cause?: unknown;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly expose: boolean;
  public readonly issues?: ValidationIssueDetail[];

  constructor(message: string, options: AppErrorOptions) {
    super(redactSecrets(message), options.cause ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.expose = options.expose ?? false;
    this.issues = options.issues;
  }
}

export class DatabaseNotConfiguredError extends AppError {
  constructor(
    message = "Database connection is not configured: DATABASE_URL is missing. Provision a Neon PostgreSQL database, enable PostGIS, and set DATABASE_URL.",
    issues?: ValidationIssueDetail[],
  ) {
    super(message, {
      code: "DATABASE_NOT_CONFIGURED",
      statusCode: 503,
      expose: true,
      issues,
    });
  }
}

export class EnvValidationError extends AppError {
  constructor(message: string, issues: ValidationIssueDetail[]) {
    super(message, {
      code: "ENV_VALIDATION_ERROR",
      statusCode: 500,
      expose: true,
      issues,
    });
  }
}

export class DatabaseUnavailableError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: "DATABASE_UNAVAILABLE",
      statusCode: 503,
      expose: true,
      cause,
    });
  }
}

export class MigrationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: "MIGRATION_ERROR",
      statusCode: 500,
      expose: false,
      cause,
    });
  }
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    issues?: ValidationIssueDetail[];
  };
  timestamp: string;
}

export function normalizeUnknownError(error: unknown): {
  statusCode: number;
  code: string;
  publicMessage: string;
  internalMessage: string;
  issues?: ValidationIssueDetail[];
} {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      publicMessage: error.expose
        ? error.message
        : "An internal server error occurred.",
      internalMessage: error.message,
      issues: error.issues,
    };
  }

  if (error instanceof Error) {
    return {
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
      publicMessage: "An unexpected server error occurred.",
      internalMessage: redactSecrets(error.message),
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    publicMessage: "An unexpected server error occurred.",
    internalMessage: redactSecrets(String(error)),
  };
}

export function toApiErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  const normalized = normalizeUnknownError(error);
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.publicMessage,
        ...(normalized.issues ? { issues: normalized.issues } : {}),
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: normalized.statusCode,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
