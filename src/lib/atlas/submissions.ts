import { createHash } from "node:crypto";
import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { requireAdminImportEnv } from "@/lib/env";
import { AdminUnauthorizedError, RequestValidationError } from "@/lib/errors";
import { extractAdminTokenFromHeaders, verifyAdminImportToken } from "@/lib/atlas/admin-import";

const plainText = (max: number, min = 0) => z.string().trim().min(min).max(max).refine((value) =>
  !/[<>]/.test(value) && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value),
"Use plain text only; HTML and control characters are not accepted.");

export const submissionInputSchema = z.strictObject({
  entity_code: z.string().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/).max(80),
  attribute: z.string().trim().regex(/^[a-z][a-z0-9_]{0,119}$/),
  proposed_value: plainText(1000, 1),
  source_url: z.string().trim().min(1).max(2048).url().refine((value) => {
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
    catch { return false; }
  }, "Provide a public HTTP or HTTPS source URL."),
  note: plainText(1000).optional().default(""),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]).optional().default(""),
  website: z.string().max(500).optional().default(""),
});

export type SubmissionInput = z.infer<typeof submissionInputSchema>;
export type SubmissionStatus = "pending" | "accepted" | "rejected";
export interface SubmissionRow {
  id: string; entity_code: string; attribute: string; proposed_value: string; source_url: string;
  note: string; email: string | null; status: SubmissionStatus; reviewer_note: string | null; created_at: string;
}

export function parseSubmissionInput(value: unknown): SubmissionInput {
  const parsed = submissionInputSchema.safeParse(value);
  if (!parsed.success) throw new RequestValidationError("Invalid suggestion form.", parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  return parsed.data;
}

export function submissionFingerprint(request: Request, salt = process.env.SUBMISSION_RATE_LIMIT_SALT ?? process.env.ADMIN_IMPORT_TOKEN ?? "gca-submission-limit") {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update(`${salt}\0${ip}`).digest("hex");
}

export async function createSubmission(request: Request, raw: unknown): Promise<{ id?: string; acceptedForReview: true; rateLimited?: true }> {
  const input = parseSubmissionInput(raw);
  // A filled honeypot is silently accepted to avoid revealing the spam control.
  if (input.website.trim()) return { acceptedForReview: true };
  const fingerprint = submissionFingerprint(request);
  const sql = getSql();
  const rows = await sql.query(
    `WITH request_lock AS MATERIALIZED (
       SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))
     ), recent AS MATERIALIZED (
       SELECT COUNT(*)::int AS attempts
         FROM submissions s CROSS JOIN request_lock
        WHERE s.request_fingerprint = $1 AND s.created_at > NOW() - INTERVAL '1 hour'
     )
     INSERT INTO submissions (entity_code, attribute, proposed_value, source_url, note, email, request_fingerprint)
     SELECT $2, $3, $4, $5, $6, NULLIF($7, ''), $1
       FROM request_lock
      WHERE (SELECT attempts FROM recent) < 5
     RETURNING id`,
    [fingerprint, input.entity_code, input.attribute, input.proposed_value, input.source_url, input.note, input.email],
  ) as Array<{ id: string }>;
  if (!rows[0]?.id) return { acceptedForReview: true, rateLimited: true };
  return { id: rows[0].id, acceptedForReview: true };
}

function assertAdminHeader(request: Request): void {
  const url = new URL(request.url);
  if (["token", "admin_import_token"].some((key) => url.searchParams.has(key))) {
    throw new RequestValidationError("Admin credentials are accepted only in an Authorization header.", [{ path: "query", message: "Remove token query parameters; use Authorization: Bearer …" }]);
  }
  const { ADMIN_IMPORT_TOKEN } = requireAdminImportEnv(process.env);
  if (!verifyAdminImportToken(extractAdminTokenFromHeaders(request.headers), ADMIN_IMPORT_TOKEN)) throw new AdminUnauthorizedError();
}

export async function listSubmissions(request: Request): Promise<SubmissionRow[]> {
  assertAdminHeader(request);
  const status = new URL(request.url).searchParams.get("status");
  if (status && !["pending", "accepted", "rejected"].includes(status)) throw new RequestValidationError("Invalid submission status.");
  const rows = await getSql().query(
    `SELECT id::text, entity_code, attribute, proposed_value, source_url, note, email, status, reviewer_note, created_at::text
       FROM submissions WHERE ($1::text IS NULL OR status = $1) ORDER BY created_at DESC LIMIT 500`,
    [status],
  );
  return rows as unknown as SubmissionRow[];
}

export async function reviewSubmission(request: Request, id: string, raw: unknown): Promise<SubmissionRow> {
  assertAdminHeader(request);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new RequestValidationError("Invalid submission ID.");
  const body = z.strictObject({ status: z.enum(["accepted", "rejected"]), reviewer_note: plainText(1000).optional().default("") }).safeParse(raw);
  if (!body.success) throw new RequestValidationError("Invalid review update.", body.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  const rows = await getSql().query(
    `UPDATE submissions SET status = $2, reviewer_note = NULLIF($3, ''), updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING id::text, entity_code, attribute, proposed_value, source_url, note, email, status, reviewer_note, created_at::text`,
    [id, body.data.status, body.data.reviewer_note],
  );
  const row = (rows as unknown as SubmissionRow[])[0];
  if (!row) throw new RequestValidationError("Submission not found.");
  // Accepted suggestions are still only research review records; this code never writes facts.
  return row;
}

export async function exportAcceptedSubmissions(request: Request): Promise<{ schema_version: 1; exported_at: string; warning: string; submissions: SubmissionRow[] }> {
  assertAdminHeader(request);
  const rows = await getSql().query(
    `SELECT id::text, entity_code, attribute, proposed_value, source_url, note, email, status, reviewer_note, created_at::text
       FROM submissions WHERE status = 'accepted' ORDER BY created_at ASC`,
  );
  return { schema_version: 1, exported_at: new Date().toISOString(),
    warning: "Research review export only. Do not auto-apply suggestions to canonical facts.", submissions: rows as unknown as SubmissionRow[] };
}
