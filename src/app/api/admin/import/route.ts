import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceAdminWriteRateLimit, resolveAdminIdentity } from "@/lib/admin/auth";
import { csvToImportPayload, planImport, type ExistingState } from "@/lib/admin/import-pipeline";
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

    // Insert evidence first (facts reference it), then entities, then facts — all as candidates.
    for (const row of plan.actionable.evidence) {
      await sql.query(
        `INSERT INTO evidence (code, title, url, publisher, source_type, published_date, accessed_date, notes)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, CURRENT_DATE),$8)
         ON CONFLICT (code) DO NOTHING`,
        [row.code, row.title, row.url ?? null, row.publisher ?? null, row.source_type,
          row.published_date ?? null, row.accessed_date ?? null, row.notes ?? null]);
    }
    for (const row of plan.actionable.entities) {
      await sql.query(
        `INSERT INTO entities (code, name_ar, name_en, entity_type, sector, status, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (code) DO NOTHING`,
        [row.code, row.name_ar, row.name_en, row.entity_type, row.sector, row.status, row.description || null]);
    }
    for (const row of plan.actionable.facts) {
      // An imported fact is always a candidate: the importer never asserts human review.
      await sql.query(
        `INSERT INTO facts (code, entity_id, attribute, value, unit, valid_as_of, verification_state, notes)
         SELECT $1, e.id, $3, $4, $5, $6::date, 'candidate', $7 FROM entities e WHERE e.code = $2
         ON CONFLICT (code) DO NOTHING`,
        [row.code, row.entity_code, row.attribute, row.value, row.unit ?? null, row.valid_as_of ?? null, row.notes ?? null]);
      for (const evidenceCode of row.evidence_codes) {
        await sql.query(
          `INSERT INTO fact_evidence (fact_id, evidence_id)
           SELECT f.id, ev.id FROM facts f, evidence ev WHERE f.code = $1 AND ev.code = $2
           ON CONFLICT DO NOTHING`, [row.code, evidenceCode]);
      }
    }

    await sql.query(
      `INSERT INTO admin_audit_log (actor, action, reason, before_state, after_state, request_fingerprint)
       VALUES ($1, 'import.commit', $2, $3::jsonb, $4::jsonb, $5)`,
      [identity.actor, `commit of preview ${plan.checksum.slice(0, 12)}`,
        JSON.stringify({ preview_checksum: plan.checksum }),
        JSON.stringify({ inserted: { entities: plan.actionable.entities.length, facts: plan.actionable.facts.length, evidence: plan.actionable.evidence.length } }),
        identity.token_fingerprint]);

    return NextResponse.json({ ok: true, mode, committed: {
      entities: plan.actionable.entities.length, facts: plan.actionable.facts.length, evidence: plan.actionable.evidence.length,
    } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

async function loadExistingState(sql: ReturnType<typeof getSql>): Promise<ExistingState> {
  const entities = await sql.query(
    `SELECT code, name_ar, name_en, aliases FROM entities ORDER BY code`) as Array<{ code: string; name_ar: string; name_en: string; aliases: string[] | null }>;
  const facts = await sql.query(`SELECT code, value FROM facts`) as Array<{ code: string; value: string }>;
  const evidence = await sql.query(`SELECT code, url FROM evidence`) as Array<{ code: string; url: string | null }>;
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
    fact_attributes_by_entity: attributesByEntity,
  };
}
