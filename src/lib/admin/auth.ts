import { createHash } from "node:crypto";
import { AdminImportNotConfiguredError, AdminUnauthorizedError } from "@/lib/errors";
import { extractAdminTokenFromHeaders, verifyAdminImportToken } from "@/lib/atlas/admin-import";
import { requireAdminImportEnv } from "@/lib/env";

/**
 * BATCH 13 — one admin guard for the whole workspace.
 *
 * The token stays server-side: it is read from the environment, compared in constant time, and never
 * echoed back or placed in a response body. A request presenting the token in the query string is
 * refused outright so the secret cannot end up in access logs or browser history.
 */
export interface AdminIdentity {
  /** Stable, non-secret label for audit rows. Derived from the token, never equal to it. */
  actor: string;
  /** SHA-256 of the presented token, for correlating writes without storing the token. */
  token_fingerprint: string;
}

export function resolveAdminIdentity(request: Request, rawEnv: NodeJS.ProcessEnv = process.env): AdminIdentity {
  const url = new URL(request.url);
  if (url.searchParams.has("token") || url.searchParams.has("admin_import_token")) {
    throw new AdminUnauthorizedError("Admin tokens must be sent in the Authorization header, never in the URL.");
  }

  let expectedToken: string;
  try {
    ({ ADMIN_IMPORT_TOKEN: expectedToken } = requireAdminImportEnv(rawEnv));
  } catch {
    // Fails closed: no configured token means nobody is an admin, not everybody.
    throw new AdminImportNotConfiguredError();
  }

  const provided = extractAdminTokenFromHeaders(request.headers);
  if (!verifyAdminImportToken(provided, expectedToken)) throw new AdminUnauthorizedError();

  const fingerprint = createHash("sha256").update(provided!.trim(), "utf8").digest("hex");
  // The actor label is what reviewers see in the audit log. It is deliberately not the token and not
  // derived reversibly from it: «admin» plus a short prefix of the token's digest.
  return { actor: `admin:${fingerprint.slice(0, 12)}`, token_fingerprint: fingerprint };
}

/**
 * Fixed-window rate limiter for write endpoints.
 *
 * This is process-local and therefore an approximation in a multi-instance deployment — it stops a
 * runaway script or a loop, not a distributed attacker. It is the same class of protection the
 * public submission endpoint already uses, and it is deliberately not presented as more than it is.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
}

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {}

  check(key: string): RateLimitResult {
    const current = this.now();
    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= current) {
      this.windows.set(key, { count: 1, resetAt: current + this.windowMs });
      return { allowed: true, remaining: this.limit - 1, retry_after_seconds: Math.ceil(this.windowMs / 1000) };
    }
    if (existing.count >= this.limit) {
      return { allowed: false, remaining: 0, retry_after_seconds: Math.max(1, Math.ceil((existing.resetAt - current) / 1000)) };
    }
    existing.count += 1;
    return { allowed: true, remaining: this.limit - existing.count, retry_after_seconds: Math.max(1, Math.ceil((existing.resetAt - current) / 1000)) };
  }

  /** Drops expired windows so a long-lived process does not grow without bound. */
  prune(): void {
    const current = this.now();
    for (const [key, window] of this.windows) if (window.resetAt <= current) this.windows.delete(key);
  }
}

/** Write endpoints are deliberately tight: a human reviewer does not need 100 writes a minute. */
export const adminWriteRateLimiter = new FixedWindowRateLimiter(30, 60_000);

export function enforceAdminWriteRateLimit(identity: AdminIdentity): void {
  const result = adminWriteRateLimiter.check(identity.actor);
  if (!result.allowed) {
    const error = new AdminUnauthorizedError(`Too many admin writes. Try again in ${result.retry_after_seconds}s.`);
    error.name = "AdminRateLimitedError";
    throw error;
  }
}
