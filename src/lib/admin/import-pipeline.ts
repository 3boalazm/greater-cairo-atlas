import { createHash } from "node:crypto";
import { z } from "zod";
import { detectDuplicates, normalizeArabicName, type DuplicateMatch } from "./review";

/**
 * BATCH 13 — import pipeline for research JSON/CSV in the existing seed format.
 *
 * schema validation → duplicate detection → diff preview (new / changed / conflicts) → approve.
 * Dry-run is the default at every layer: `planImport` throws nothing away and writes nothing; only an
 * explicit commit may insert, and only rows that survive validation.
 */
export const importEntityRowSchema = z.strictObject({
  code: z.string().min(1).max(120),
  name_ar: z.string().min(1).max(300),
  name_en: z.string().min(1).max(300),
  entity_type: z.string().min(1).max(60),
  sector: z.string().min(1).max(40),
  status: z.string().min(1).max(40),
  aliases: z.string().max(2000).optional().default(""),
  description: z.string().max(4000).optional().default(""),
});

export const importFactRowSchema = z.strictObject({
  code: z.string().min(1).max(160),
  entity_code: z.string().min(1).max(120),
  attribute: z.string().min(1).max(120),
  value: z.string().min(1).max(2000),
  unit: z.string().max(60).nullable().optional(),
  valid_as_of: z.string().max(40).nullable().optional(),
  valid_as_of_precision: z.enum(["day", "month", "year"]).optional().default("day"),
  verification_state: z.enum(["candidate", "verified", "disputed", "corroborated", "single_source", "superseded", "rejected"]),
  evidence_codes: z.array(z.string().min(1).max(120)).default([]),
  notes: z.string().max(4000).nullable().optional(),
});

export const importEvidenceRowSchema = z.strictObject({
  code: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  url: z.string().max(2048).nullable().optional(),
  publisher: z.string().max(300).nullable().optional(),
  source_type: z.string().min(1).max(60),
  published_date: z.string().max(40).nullable().optional(),
  published_date_precision: z.enum(["day", "month", "year"]).optional().default("day"),
  accessed_date: z.string().max(40).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export const importPayloadSchema = z.object({
  entities: z.array(z.unknown()).optional().default([]),
  facts: z.array(z.unknown()).optional().default([]),
  evidence: z.array(z.unknown()).optional().default([]),
});

export type ImportEntityRow = z.infer<typeof importEntityRowSchema>;
export type ImportFactRow = z.infer<typeof importFactRowSchema>;
export type ImportEvidenceRow = z.infer<typeof importEvidenceRowSchema>;

export interface ImportIssue {
  section: "entities" | "facts" | "evidence" | "payload";
  index: number;
  path: string;
  message: string;
}

export interface ExistingState {
  entity_codes: ReadonlySet<string>;
  fact_codes: ReadonlySet<string>;
  evidence_codes: ReadonlySet<string>;
  entities: ReadonlyArray<{ code: string; name_ar: string; name_en: string; aliases: readonly string[] }>;
  /** fact code → value, so a changed claim can be shown as changed rather than new. */
  fact_values: ReadonlyMap<string, string>;
  /** evidence code → url, so a newly-added URL is visible in the diff. */
  evidence_urls: ReadonlyMap<string, string | null>;
  /**
   * evidence code → source_type for evidence already in the database. Without this the planner cannot
   * tell an official source from a blog, and would have to reject every `verified` row that cites stored
   * evidence — which is exactly what a legitimate curated import does.
   */
  evidence_source_types?: ReadonlyMap<string, string>;
  /** entity code → existing attribute→value, for conflict detection. */
  fact_attributes_by_entity: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

export type DiffCategory = "new" | "changed" | "unchanged" | "conflict" | "rejected";

export interface DiffRow {
  section: "entities" | "facts" | "evidence";
  code: string;
  category: DiffCategory;
  /** Why it landed in this category. Always a statement about the data, never a guess. */
  reason: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface ImportPlan {
  ok: boolean;
  checksum: string;
  issues: ImportIssue[];
  rejected_rows: Array<{ section: DiffRow["section"]; code: string; reason: string }>;
  duplicates: DuplicateMatch[];
  diff: DiffRow[];
  counts: {
    entities: { new: number; changed: number; unchanged: number; rejected: number };
    facts: { new: number; changed: number; unchanged: number; conflict: number; rejected: number };
    evidence: { new: number; changed: number; unchanged: number; rejected: number };
  };
  /** Rows that a commit would actually insert, already validated. Empty for a blocked plan. */
  actionable: {
    entities: ImportEntityRow[];
    facts: ImportFactRow[];
    evidence: ImportEvidenceRow[];
  };
}

function isUsableUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * A row marked `verified` may only enter when some evidence it cites is official and has a usable URL.
 * Rows failing this are rejected, never downgraded silently: the importer must not invent a state the
 * contributor did not ask for, and must not admit an unverifiable verified claim.
 */
export function verifiedRowRejection(
  fact: ImportFactRow,
  evidenceByCode: ReadonlyMap<string, ImportEvidenceRow | { code: string; source_type: string; url?: string | null }>,
  knownEvidenceCodes: ReadonlySet<string>,
  storedEvidence?: {
    urls?: ReadonlyMap<string, string | null>;
    sourceTypes?: ReadonlyMap<string, string>;
  },
): string | null {
  if (fact.verification_state !== "verified") return null;
  if (fact.evidence_codes.length === 0) return "marked verified but cites no evidence";

  let sawUnknownSource = false;
  for (const code of fact.evidence_codes) {
    if (!knownEvidenceCodes.has(code)) continue;
    // Evidence in the payload describes itself; stored evidence is described by the caller's lookup.
    const row = evidenceByCode.get(code);
    if (row) {
      if (row.source_type === "official" && isUsableUrl(row.url)) return null;
      continue;
    }
    const sourceType = storedEvidence?.sourceTypes?.get(code);
    if (sourceType === undefined) {
      // The caller could not tell us what this source is. Refuse rather than assume it is official.
      sawUnknownSource = true;
      continue;
    }
    const url = storedEvidence?.urls?.get(code) ?? null;
    if (sourceType === "official" && isUsableUrl(url)) return null;
  }
  return sawUnknownSource && fact.evidence_codes.every((code) => !evidenceByCode.has(code))
    ? "marked verified but the cited evidence's source type could not be checked"
    : "marked verified but no cited evidence is an official source with a usable URL";
}

export function hashPayload(payloadText: string): string {
  return createHash("sha256").update(payloadText, "utf8").digest("hex");
}

export function planImport(
  payloadText: string,
  existing: ExistingState,
): ImportPlan {
  const issues: ImportIssue[] = [];
  const rejected: ImportPlan["rejected_rows"] = [];

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(payloadText);
  } catch (error) {
    return {
      ok: false,
      checksum: hashPayload(payloadText),
      issues: [{ section: "payload", index: 0, path: "body", message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` }],
      rejected_rows: [],
      duplicates: [],
      diff: [],
      counts: {
        entities: { new: 0, changed: 0, unchanged: 0, rejected: 0 },
        facts: { new: 0, changed: 0, unchanged: 0, conflict: 0, rejected: 0 },
        evidence: { new: 0, changed: 0, unchanged: 0, rejected: 0 },
      },
      actionable: { entities: [], facts: [], evidence: [] },
    };
  }

  const payloadResult = importPayloadSchema.safeParse(parsedJson);
  if (!payloadResult.success) {
    return {
      ok: false,
      checksum: hashPayload(payloadText),
      issues: payloadResult.error.issues.map((issue) => ({ section: "payload" as const, index: 0, path: issue.path.join("."), message: issue.message })),
      rejected_rows: [],
      duplicates: [],
      diff: [],
      counts: {
        entities: { new: 0, changed: 0, unchanged: 0, rejected: 0 },
        facts: { new: 0, changed: 0, unchanged: 0, conflict: 0, rejected: 0 },
        evidence: { new: 0, changed: 0, unchanged: 0, rejected: 0 },
      },
      actionable: { entities: [], facts: [], evidence: [] },
    };
  }

  const raw = payloadResult.data;
  const entities: ImportEntityRow[] = [];
  const facts: ImportFactRow[] = [];
  const evidenceRows: ImportEvidenceRow[] = [];

  raw.entities.forEach((row, index) => {
    const result = importEntityRowSchema.safeParse(row);
    if (result.success) entities.push(result.data);
    else {
      const code = (row as { code?: string })?.code ?? `#${index}`;
      rejected.push({ section: "entities", code, reason: result.error.issues.map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`).join("; ") });
      issues.push(...result.error.issues.map((issue) => ({ section: "entities" as const, index, path: issue.path.join("."), message: issue.message })));
    }
  });
  raw.evidence.forEach((row, index) => {
    const result = importEvidenceRowSchema.safeParse(row);
    if (result.success) evidenceRows.push(result.data);
    else {
      const code = (row as { code?: string })?.code ?? `#${index}`;
      rejected.push({ section: "evidence", code, reason: result.error.issues.map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`).join("; ") });
      issues.push(...result.error.issues.map((issue) => ({ section: "evidence" as const, index, path: issue.path.join("."), message: issue.message })));
    }
  });

  const incomingEvidence = new Map(evidenceRows.map((row) => [row.code, row]));
  const knownEvidence = new Set([...existing.evidence_codes, ...incomingEvidence.keys()]);

  raw.facts.forEach((row, index) => {
    const result = importFactRowSchema.safeParse(row);
    if (!result.success) {
      const code = (row as { code?: string })?.code ?? `#${index}`;
      rejected.push({ section: "facts", code, reason: result.error.issues.map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`).join("; ") });
      issues.push(...result.error.issues.map((issue) => ({ section: "facts" as const, index, path: issue.path.join("."), message: issue.message })));
      return;
    }
    const fact = result.data;
    // A fact may only reference evidence that exists now or arrives in this same payload.
    const missingEvidence = fact.evidence_codes.filter((code) => !knownEvidence.has(code));
    if (missingEvidence.length > 0) {
      rejected.push({ section: "facts", code: fact.code, reason: `cites evidence that does not exist: ${missingEvidence.join(", ")}` });
      return;
    }
    const rejection = verifiedRowRejection(fact, incomingEvidence, knownEvidence, {
      urls: existing.evidence_urls,
      sourceTypes: existing.evidence_source_types,
    });
    if (rejection) {
      rejected.push({ section: "facts", code: fact.code, reason: rejection });
      return;
    }
    facts.push(fact);
  });

  // ---- duplicate detection against existing entities -------------------------------
  const duplicates = detectDuplicates(
    entities.map((row) => ({ code: row.code, name_ar: row.name_ar, name_en: row.name_en, aliases: row.aliases.split("|").map((item) => item.trim()).filter(Boolean) })),
    existing.entities.map((entity) => ({ code: entity.code, name_ar: entity.name_ar, name_en: entity.name_en, aliases: entity.aliases })),
  );

  // ---- diff -----------------------------------------------------------------------
  const diff: DiffRow[] = [];
  const counts = {
    entities: { new: 0, changed: 0, unchanged: 0, rejected: rejected.filter((row) => row.section === "entities").length },
    facts: { new: 0, changed: 0, unchanged: 0, conflict: 0, rejected: rejected.filter((row) => row.section === "facts").length },
    evidence: { new: 0, changed: 0, unchanged: 0, rejected: rejected.filter((row) => row.section === "evidence").length },
  };

  const actionableEntities: ImportEntityRow[] = [];
  for (const row of entities) {
    const exists = existing.entity_codes.has(row.code);
    if (!exists) {
      counts.entities.new += 1;
      actionableEntities.push(row);
      diff.push({ section: "entities", code: row.code, category: "new", reason: "New entity code.", before: null, after: { ...row } });
    } else {
      // An existing entity is never rewritten by an import: only genuinely new entities are inserted,
      // anything else is surfaced for a human decision instead of being applied silently.
      counts.entities.unchanged += 1;
      diff.push({ section: "entities", code: row.code, category: "unchanged", reason: "Entity code already exists; not overwritten by an import.", before: { code: row.code }, after: { ...row } });
    }
  }

  const actionableEvidence: ImportEvidenceRow[] = [];
  for (const row of evidenceRows) {
    const existingUrl = existing.evidence_urls.get(row.code);
    if (!existing.evidence_codes.has(row.code)) {
      counts.evidence.new += 1;
      actionableEvidence.push(row);
      diff.push({ section: "evidence", code: row.code, category: "new", reason: "New evidence code.", before: null, after: { ...row } });
    } else if ((existingUrl ?? null) !== (row.url ?? null)) {
      counts.evidence.changed += 1;
      diff.push({ section: "evidence", code: row.code, category: "changed", reason: "Evidence URL differs from the stored row; review before applying.", before: { url: existingUrl ?? null }, after: { url: row.url ?? null } });
    } else {
      counts.evidence.unchanged += 1;
      diff.push({ section: "evidence", code: row.code, category: "unchanged", reason: "Identical to the stored evidence row.", before: { url: existingUrl ?? null }, after: { url: row.url ?? null } });
    }
  }

  const actionableFacts: ImportFactRow[] = [];
  for (const row of facts) {
    const existingValue = existing.fact_values.get(row.code);
    const entityAttributes = existing.fact_attributes_by_entity.get(row.entity_code);
    const conflictingValue = entityAttributes?.get(row.attribute);
    if (!existing.fact_codes.has(row.code)) {
      // The same attribute on the same entity with a different value is a conflict, not a new claim.
      if (conflictingValue !== undefined && normalizeArabicName(conflictingValue) !== normalizeArabicName(row.value)) {
        counts.facts.conflict += 1;
        diff.push({ section: "facts", code: row.code, category: "conflict", reason: `Entity already records ${row.attribute} = «${conflictingValue}»; this row says «${row.value}».`, before: { value: conflictingValue }, after: { ...row } });
      } else {
        counts.facts.new += 1;
        actionableFacts.push(row);
        diff.push({ section: "facts", code: row.code, category: "new", reason: "New fact code.", before: null, after: { ...row } });
      }
    } else if (existingValue !== row.value) {
      counts.facts.changed += 1;
      diff.push({ section: "facts", code: row.code, category: "changed", reason: "Same fact code with a different value; review before applying.", before: { value: existingValue ?? null }, after: { ...row } });
    } else {
      counts.facts.unchanged += 1;
      diff.push({ section: "facts", code: row.code, category: "unchanged", reason: "Identical to the stored fact.", before: { value: existingValue ?? null }, after: { ...row } });
    }
  }

  return {
    ok: true,
    checksum: hashPayload(payloadText),
    issues,
    rejected_rows: rejected,
    duplicates,
    diff,
    counts,
    actionable: { entities: actionableEntities, facts: actionableFacts, evidence: actionableEvidence },
  };
}

/**
 * Minimal CSV reader for the seed's flat format. Handles quoted fields with embedded commas and
 * doubled quotes, which the seed files actually use. It is deliberately strict: a ragged row is an
 * error, not something to guess at.
 */
export function parseCsv(text: string): { rows: Record<string, string>[]; error: string | null } {
  const lines: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; }
        else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ",") { row.push(field); field = ""; continue; }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim().length > 0)) lines.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); if (row.some((cell) => cell.trim().length > 0)) lines.push(row); }
  if (quoted) return { rows: [], error: "Unterminated quoted field." };
  if (lines.length === 0) return { rows: [], error: "The CSV file is empty." };
  const header = lines[0]!.map((cell) => cell.trim());
  const rows = lines.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((name, position) => { record[name] = cells[position] ?? ""; });
    return record;
  });
  return { rows, error: null };
}

/** Converts a seed-format CSV upload into the JSON shape `planImport` expects. */
export function csvToImportPayload(text: string, section: "entities" | "facts" | "evidence"): { payload: string; error: string | null } {
  const { rows, error } = parseCsv(text);
  if (error) return { payload: "", error };
  const normalized = rows.map((row) => {
    if (section === "facts") {
      return { ...row, evidence_codes: (row.evidence_codes ?? "").split("|").map((item) => item.trim()).filter(Boolean) };
    }
    if (section === "entities" && row.aliases) {
      return { ...row, aliases: row.aliases.split("|").map((item) => item.trim()).join("|") };
    }
    return row;
  });
  return { payload: JSON.stringify({ [section]: normalized }), error: null };
}
