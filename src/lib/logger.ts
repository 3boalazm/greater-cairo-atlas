import { redactSecrets } from "@/lib/errors";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const SENSITIVE_KEY_PATTERN =
  /^(database_url|database_url_unpooled|databaseurl|databaseurlunpooled|postgres_url|postgres_url_non_pooling|connectionstring|connection_string|admin_import_token|adminimporttoken|x-admin-import-token|password|secret|token|authorization|api_key|apikey|.*_token|.*_secret|.*_password)$/i;

function resolveConfiguredLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (
    raw === "debug" ||
    raw === "info" ||
    raw === "warn" ||
    raw === "error" ||
    raw === "silent"
  ) {
    return raw;
  }
  if (process.env.NODE_ENV === "test") {
    return "silent";
  }
  return "info";
}

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return "[MaxDepth]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return redactSecrets(value);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (value instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: value.name,
      message: redactSecrets(value.message),
    };
    if ("code" in value && typeof value.code === "string") {
      serialized.code = value.code;
    }
    if (process.env.NODE_ENV !== "production" && value.stack) {
      serialized.stack = redactSecrets(value.stack);
    }
    if (value.cause !== undefined) {
      serialized.cause = sanitizeLogValue(value.cause, depth + 1);
    }
    return serialized;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const sanitizedRecord: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitizedRecord[key] = "[REDACTED]";
      } else {
        sanitizedRecord[key] = sanitizeLogValue(entryValue, depth + 1);
      }
    }
    return sanitizedRecord;
  }
  return String(value);
}

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(bindings: LogContext): Logger;
}

function shouldEmit(level: Exclude<LogLevel, "silent">): boolean {
  const configured = resolveConfiguredLevel();
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[configured];
}

function isJsonOutputMode(): boolean {
  return (
    process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL)
  );
}

function writeLog(
  level: Exclude<LogLevel, "silent">,
  message: string,
  context?: LogContext,
): void {
  if (!shouldEmit(level)) {
    return;
  }

  const timestamp = new Date().toISOString();
  const safeMessage = redactSecrets(message);
  const safeContext = context
    ? (sanitizeLogValue(context) as Record<string, unknown>)
    : undefined;

  const writer =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;

  if (isJsonOutputMode()) {
    writer(
      JSON.stringify({
        timestamp,
        level,
        service: "greater-cairo-atlas",
        message: safeMessage,
        ...(safeContext ? { context: safeContext } : {}),
      }),
    );
    return;
  }

  const contextSuffix =
    safeContext && Object.keys(safeContext).length > 0
      ? ` ${JSON.stringify(safeContext)}`
      : "";
  writer(`[${timestamp}] ${level.toUpperCase()} ${safeMessage}${contextSuffix}`);
}

export function createLogger(baseBindings: LogContext = {}): Logger {
  const mergeContext = (context?: LogContext): LogContext | undefined => {
    const hasBase = Object.keys(baseBindings).length > 0;
    const hasContext = Boolean(context && Object.keys(context).length > 0);
    if (!hasBase && !hasContext) {
      return undefined;
    }
    return { ...baseBindings, ...context };
  };

  return {
    debug(message, context) {
      writeLog("debug", message, mergeContext(context));
    },
    info(message, context) {
      writeLog("info", message, mergeContext(context));
    },
    warn(message, context) {
      writeLog("warn", message, mergeContext(context));
    },
    error(message, context) {
      writeLog("error", message, mergeContext(context));
    },
    child(bindings) {
      return createLogger({ ...baseBindings, ...bindings });
    },
  };
}

export const logger = createLogger();
