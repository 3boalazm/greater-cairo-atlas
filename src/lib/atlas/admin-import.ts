import { createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import {
  runSeedImport,
  type ImportSyncReport,
  type SeedBundleReport,
  type SeedDbSession,
} from "@/lib/atlas/seed";
import { requireAdminImportEnv } from "@/lib/env";
import {
  AdminUnauthorizedError,
  RequestValidationError,
} from "@/lib/errors";

const adminImportRequestBodySchema = z.strictObject({
  dryRun: z.boolean().optional().default(true),
});

export interface AdminSeedImportResponseBody {
  ok: true;
  mode: "dry_run" | "import";
  dryRun: boolean;
  summary: {
    entitiesCount: number;
    evidenceCount: number;
    factsCount: number;
    factEvidenceLinksCount: number;
    featuresCount: number;
    importSync: ImportSyncReport;
  };
  report: SeedBundleReport;
  timestamp: string;
}

export interface ExecuteAdminSeedImportOptions {
  request: Request;
  rawEnv?: NodeJS.ProcessEnv;
  seedDir?: string;
  featuresPath?: string | null;
  sessionFactory?: () => SeedDbSession;
}

/**
 * Compares two tokens in constant time by hashing both with SHA-256 first,
 * preventing timing side-channels from leaking token length or prefix characters.
 */
export function verifyAdminImportToken(
  providedToken: string | null,
  expectedToken: string,
): boolean {
  if (!providedToken || providedToken.trim().length === 0) {
    return false;
  }

  const providedDigest = createHash("sha256")
    .update(providedToken.trim(), "utf8")
    .digest();
  const expectedDigest = createHash("sha256")
    .update(expectedToken.trim(), "utf8")
    .digest();

  return timingSafeEqual(providedDigest, expectedDigest);
}

export function extractAdminTokenFromHeaders(headers: Headers): string | null {
  const authHeader = headers.get("authorization");
  if (authHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match?.[1]) {
      return match[1].trim();
    }
    return null;
  }

  const customHeader = headers.get("x-admin-import-token");
  if (customHeader && customHeader.trim().length > 0) {
    return customHeader.trim();
  }

  return null;
}

export function parseAdminImportRequestBody(rawText: string): {
  dryRun: boolean;
} {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return { dryRun: true };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(trimmed);
  } catch (error) {
    throw new RequestValidationError(
      `Invalid JSON request body: ${error instanceof Error ? error.message : String(error)}`,
      [
        {
          path: "body",
          message: "Request body must be empty or valid JSON (e.g. {\"dryRun\": true}).",
        },
      ],
    );
  }

  const validated = adminImportRequestBodySchema.safeParse(parsedJson);
  if (!validated.success) {
    const issues = validated.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? `body.${issue.path.join(".")}` : "body",
      message: issue.message,
    }));
    throw new RequestValidationError(
      `Invalid request parameters: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
      issues,
    );
  }

  return validated.data;
}

/**
 * Protected server-side handler for `POST /api/admin/import-seed`.
 * - Fails closed (503) if ADMIN_IMPORT_TOKEN is not configured on the server.
 * - Rejects query-string tokens (400) so secrets never leak in access logs.
 * - Verifies Bearer / x-admin-import-token in constant time (401 on failure).
 * - Defaults to `dryRun: true` unless explicitly passed `{"dryRun": false}`.
 * - Executes inside Vercel using server-side DATABASE_URL without ever exposing it.
 */
export async function executeAdminSeedImport(
  options: ExecuteAdminSeedImportOptions,
): Promise<AdminSeedImportResponseBody> {
  const { ADMIN_IMPORT_TOKEN } = requireAdminImportEnv(
    options.rawEnv ?? process.env,
  );

  const parsedUrl = new URL(options.request.url);
  if (
    parsedUrl.searchParams.has("token") ||
    parsedUrl.searchParams.has("admin_import_token")
  ) {
    throw new RequestValidationError(
      "Do not pass ADMIN_IMPORT_TOKEN in URL query parameters. Supply `Authorization: Bearer <token>` header instead.",
      [
        {
          path: "query.token",
          message:
            "Admin token must be sent in the Authorization header, never in the URL.",
        },
      ],
    );
  }

  const providedToken = extractAdminTokenFromHeaders(options.request.headers);
  if (!verifyAdminImportToken(providedToken, ADMIN_IMPORT_TOKEN)) {
    throw new AdminUnauthorizedError();
  }

  const rawBodyText = await options.request.text();
  const { dryRun } = parseAdminImportRequestBody(rawBodyText);

  const result = await runSeedImport({
    ...(options.seedDir ? { seedDir: options.seedDir } : {}),
    featuresPath: options.featuresPath !== undefined
      ? options.featuresPath
      : options.seedDir
        ? null
        : path.join(process.cwd(), "data", "features", "features.geojson"),
    dryRun,
    ...(options.sessionFactory
      ? { sessionFactory: options.sessionFactory }
      : {}),
  });

  return {
    ok: true,
    mode: result.dryRun ? "dry_run" : "import",
    dryRun: result.dryRun,
    summary: {
      entitiesCount: result.entitiesCount,
      evidenceCount: result.evidenceCount,
      factsCount: result.factsCount,
      factEvidenceLinksCount: result.factEvidenceLinksCount,
      featuresCount: result.featuresCount,
      importSync: result.importSync,
    },
    report: result.report,
    timestamp: new Date().toISOString(),
  };
}
