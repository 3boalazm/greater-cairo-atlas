import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceAdminWriteRateLimit, resolveAdminIdentity } from "@/lib/admin/auth";
import { csvToImportPayload, planImport, type ExistingState } from "@/lib/admin/import-pipeline";
import { commitImportPlan } from "@/lib/admin/import-commit";
import { defaultExecutor } from "@/lib/admin/queries";
import { getSql } from "@/lib/db/client";
import { RequestValidationError, toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.strictObject({
  /** Always processed as a dry run unless this is explicitly `"commit"`. */
  mode: z.enum(["dry_run", "commit"]).default("dry_run"),
  format: z.enum(["json", "csv"]).default("json"),
  /** For CSV: which of the three seed sections the file contains. */
  section: z.enum(["entities", "facts", "evidence"]).optional(),
  /** SHA-256 of the payload returned by a previous dry run. Required to commit. */
  preview_checksum: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  payload: z.string().min(1).max(5_000_000),
});

/**
 * BATCH 13 — POST /api/admin/import
 *
 * Dry run by default. A commit requires the checksum of the plan that was previewed, so the person
 * approving is approving exactly those bytes rather than a recomputation.
 *
 * Committing inserts only rows the plan marked actionable, only as candidates, and only when the
 * evidence they cite already exists in the database or arrives in the same payload.
 */
export async function POST(request: Request) {
  try {
    const identity = resolveAdminIdentity(request);
    enforceAdminWriteRateLimit(identity);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new RequestValidationError("Invalid import request.", parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "body", message: issue.message,
      })));
    }
    const { mode, format, section, payload, preview_checksum: previewChecksum } = parsed.data;

    let payloadText = payload;
    if (format === "csv") {
      if (!section) throw new RequestValidationError("A CSV import must declare its section.", [{ path: "section", message: "Provide entities, facts or evidence." }]);
      const converted = csvToImportPayload(payload, section);
      if (converted.error) throw new RequestValidationError(converted.error, [{ path: "payload", message: converted.error }]);
      payloadText = converted.payload;
    }

    const sql = getSql();
    const existing = await loadExistingState(sql);
    const plan = planImport(payloadText, existing);

    if (mode === "dry_run") {
      // Record the preview so a later commit can be checked against it.
      await sql.query(
        `INSERT INTO admin_import_previews (created_by, source_filename, source_format, payload_checksum, summary, diff)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
        [identity.actor, `upload.${format}`, format, plan.checksum,
          JSON.stringify({ ok: plan.ok, counts: plan.counts, duplicates: plan.duplicates.length, rejected: plan.rejected_rows.length }),
          JSON.stringify(plan.diff.slice(0, 500))],
      );
      return NextResponse.json({ ok: true, mode, plan }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    if (previewChecksum !== plan.checksum) {
      throw new RequestValidationError("This payload is not the one that was previewed.", [{
        path: "preview_checksum",
        message: "Run the dry run again and pass the checksum it returned.",
      }]);
    }
    if (!plan.ok) {
      throw new RequestValidationError("The payload does not validate, so it was not committed.", plan.issues.slice(0, 20).map((issue) => ({
        path: `${issue.section}[${issue.index}].${issue.path}`, message: issue.message,
      })));
    }

    const committed = await commitImportPlan(defaultExecutor, plan);

    await sql.query(
      `INSERT INTO admin_audit_log (actor, action, reason, before_state, after_state, request_fingerprint)
       VALUES ($1, 'import.commit', $2, $3::jsonb, $4::jsonb, $5)`,
      [identity.actor, `commit of preview ${plan.checksum.slice(0, 12)}`,
        JSON.stringify({ preview_checksum: plan.checksum }),
        JSON.stringify({ inserted: committed }),
        identity.token_fingerprint]);

    return NextResponse.json({ ok: true, mode, committed }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

async function loadExistingState(sql: ReturnType<typeof getSql>): Promise<ExistingState> {
  const entities = await sql.query(
    `SELECT code, name_ar, name_en, aliases FROM entities ORDER BY code`) as Array<{ code: string; name_ar: string; name_en: string; aliases: string[] | null }>;
  const facts = await sql.query(`SELECT code, value FROM facts`) as Array<{ code: string; value: string }>;
  const evidence = await sql.query(`SELECT code, url, source_type FROM evidence`) as Array<{ code: string; url: string | null; source_type: string }>;
  const attributes = await sql.query(
    `SELECT e.code AS entity_code, f.attribute, f.value FROM facts f JOIN entities e ON e.id = f.entity_id`) as Array<{ entity_code: string; attribute: string; value: string }>;

  const attributesByEntity = new Map<string, Map<string, string>>();
  for (const row of attributes) {
    const map = attributesByEntity.get(row.entity_code) ?? new Map<string, string>();
    if (!map.has(row.attribute)) map.set(row.attribute, row.value);
    attributesByEntity.set(row.entity_code, map);
  }

  return {
    entity_codes: new Set(entities.map((row) => row.code)),
    fact_codes: new Set(facts.map((row) => row.code)),
    evidence_codes: new Set(evidence.map((row) => row.code)),
    entities: entities.map((row) => ({ code: row.code, name_ar: row.name_ar, name_en: row.name_en, aliases: row.aliases ?? [] })),
    fact_values: new Map(facts.map((row) => [row.code, row.value])),
    evidence_urls: new Map(evidence.map((row) => [row.code, row.url])),
    evidence_source_types: new Map(evidence.map((row) => [row.code, row.source_type])),
    fact_attributes_by_entity: attributesByEntity,
  };
}
