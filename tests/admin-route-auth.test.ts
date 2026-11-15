import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter, resolveAdminIdentity } from "@/lib/admin/auth";

const TOKEN = "a-very-long-test-token-value-0123456789";
const env = { ADMIN_IMPORT_TOKEN: TOKEN } as unknown as NodeJS.ProcessEnv;

const request = (init: { token?: string; query?: string; header?: string } = {}) => {
  const url = `https://atlas.example.org/api/admin/entities${init.query ?? ""}`;
  const headers = new Headers();
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.header) headers.set("x-admin-import-token", init.header);
  return new Request(url, { headers });
};

describe("BATCH 13 — every admin route requires the token, server-side only", () => {
  it("accepts a valid bearer token and derives a non-secret actor label", () => {
    const identity = resolveAdminIdentity(request({ token: TOKEN }), env);
    expect(identity.actor).toMatch(/^admin:[a-f0-9]{12}$/u);
    // The audit label must not contain the token itself.
    expect(identity.actor).not.toContain(TOKEN);
    expect(identity.token_fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(identity.token_fingerprint).not.toBe(TOKEN);
  });

  it("accepts the x-admin-import-token header, for backwards compatibility", () => {
    expect(resolveAdminIdentity(request({ header: TOKEN }), env).actor).toContain("admin:");
  });

  it("rejects a missing, wrong, or truncated token", () => {
    expect(() => resolveAdminIdentity(request(), env)).toThrow(/unauthori[sz]ed/i);
    expect(() => resolveAdminIdentity(request({ token: "wrong-token-value-here" }), env)).toThrow(/unauthori[sz]ed/i);
    expect(() => resolveAdminIdentity(request({ token: TOKEN.slice(0, -1) }), env)).toThrow(/unauthori[sz]ed/i);
  });

  it("refuses a token passed in the query string so it cannot leak into logs", () => {
    expect(() => resolveAdminIdentity(request({ token: TOKEN, query: `?token=${TOKEN}` }), env)).toThrow(/never in the URL|header/i);
  });

  it("fails closed when no admin token is configured", () => {
    expect(() => resolveAdminIdentity(request({ token: TOKEN }), {} as unknown as NodeJS.ProcessEnv)).toThrow(/not configured/i);
  });

  it("produces the same actor for the same token and a different one for another", () => {
    const a = resolveAdminIdentity(request({ token: TOKEN }), env);
    const b = resolveAdminIdentity(request({ token: TOKEN }), env);
    const c = resolveAdminIdentity(request({ token: "another-long-test-token-abcdefghij" }),
      { ADMIN_IMPORT_TOKEN: "another-long-test-token-abcdefghij" } as unknown as NodeJS.ProcessEnv);
    expect(a.actor).toBe(b.actor);
    expect(a.actor).not.toBe(c.actor);
  });
});

describe("BATCH 13 — write endpoints are rate limited", () => {
  it("allows up to the limit inside a window and then refuses", () => {
    let now = 1_000_000;
    const limiter = new FixedWindowRateLimiter(3, 60_000, () => now);
    expect(limiter.check("admin:abc").allowed).toBe(true);
    expect(limiter.check("admin:abc").allowed).toBe(true);
    expect(limiter.check("admin:abc").allowed).toBe(true);
    const blocked = limiter.check("admin:abc");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retry_after_seconds).toBeGreaterThan(0);
    // A different actor is unaffected.
    expect(limiter.check("admin:def").allowed).toBe(true);
    // After the window resets, writes are allowed again.
    now += 61_000;
    expect(limiter.check("admin:abc").allowed).toBe(true);
  });

  it("prunes expired windows so memory does not grow forever", () => {
    let now = 1_000_000;
    const limiter = new FixedWindowRateLimiter(1, 1_000, () => now);
    limiter.check("a"); limiter.check("b");
    now += 2_000;
    limiter.prune();
    // After pruning, a fresh window starts rather than the old count carrying over.
    expect(limiter.check("a").remaining).toBe(0);
  });
});

describe("BATCH 13 — the route handlers themselves reject unauthenticated calls", () => {
  it("returns 401 from every admin mutation/read route without a token", async () => {
    const previous = process.env.ADMIN_IMPORT_TOKEN;
    process.env.ADMIN_IMPORT_TOKEN = TOKEN;
    try {
      const review = (await import("@/app/api/admin/review/[factCode]/route")).POST;
      const entities = (await import("@/app/api/admin/entities/route")).GET;
      const audit = (await import("@/app/api/admin/audit/route")).GET;
      const importer = (await import("@/app/api/admin/import/route")).POST;

      const unauthenticated = new Request("https://atlas.example.org/api/admin/review/F-1", {
        method: "POST", body: JSON.stringify({ action: "approve" }),
      });
      const responses = [
        await review(unauthenticated, { params: Promise.resolve({ factCode: "F-1" }) }),
        await entities(new Request("https://atlas.example.org/api/admin/entities")),
        await audit(new Request("https://atlas.example.org/api/admin/audit")),
        await importer(new Request("https://atlas.example.org/api/admin/import", { method: "POST", body: "{}" })),
      ];
      for (const response of responses) {
        expect(response.status).toBe(401);
        const body = await response.json() as { ok: boolean; error?: { code: string } };
        expect(body.ok).toBe(false);
        expect(body.error?.code).toBe("ADMIN_UNAUTHORIZED");
      }
    } finally {
      if (previous === undefined) delete process.env.ADMIN_IMPORT_TOKEN;
      else process.env.ADMIN_IMPORT_TOKEN = previous;
    }
  });

  it("does not leak the token or a database URL in an unauthenticated response", async () => {
    const previous = process.env.ADMIN_IMPORT_TOKEN;
    process.env.ADMIN_IMPORT_TOKEN = TOKEN;
    try {
      const entities = (await import("@/app/api/admin/entities/route")).GET;
      const response = await entities(new Request("https://atlas.example.org/api/admin/entities"));
      const text = await response.text();
      expect(text).not.toContain(TOKEN);
      expect(text).not.toMatch(/postgres(ql)?:\/\//u);
    } finally {
      if (previous === undefined) delete process.env.ADMIN_IMPORT_TOKEN;
      else process.env.ADMIN_IMPORT_TOKEN = previous;
    }
  });
});
