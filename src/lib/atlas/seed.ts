import { readFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import {
  entitySeedSchema,
  evidenceSeedSchema,
  factSeedSchema,
  type EntitySeed,
  type EvidenceSeed,
  type FactSeed,
} from "@/lib/atlas/schema";
import { createNeonSessionClient } from "@/lib/db/client";
import {
  SeedValidationError,
  type ValidationIssueDetail,
} from "@/lib/errors";
import { logger } from "@/lib/logger";

const REQUIRED_ENTITY_CSV_HEADERS = [
  "code",
  "name_ar",
  "name_en",
  "entity_type",
  "sector",
  "status",
] as const;

const ALLOWED_ENTITY_CSV_HEADERS = new Set<string>([
  ...REQUIRED_ENTITY_CSV_HEADERS,
  "description",
]);

export interface ValidatedSeedBundle {
  entities: EntitySeed[];
  evidence: EvidenceSeed[];
  facts: FactSeed[];
}

export interface RawSeedSources {
  entitiesCsv: string;
  evidenceJsonText: string;
  factsJsonText: string;
}

export interface SeedDbSession {
  connect(): Promise<void>;
  query<Row = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
  end(): Promise<void>;
}

export interface RunSeedImportOptions {
  seedDir?: string;
  dryRun?: boolean;
  sessionFactory?: () => SeedDbSession;
}

export interface SeedImportSummary {
  dryRun: boolean;
  seedDir: string;
  entitiesCount: number;
  evidenceCount: number;
  factsCount: number;
  factEvidenceLinksCount: number;
}

interface ParsedCsvRow {
  lineNumber: number;
  cells: string[];
}

/**
 * RFC 4180 compliant CSV tokenizer supporting quoted fields, escaped quotes (""),
 * UTF-8 text (including Arabic), and CRLF/LF newlines.
 */
export function parseCsvRows(
  rawText: string,
  issues: ValidationIssueDetail[],
  fileLabel = "entities.csv",
): ParsedCsvRow[] {
  const text = rawText.replace(/^\uFEFF/, "");
  const rows: ParsedCsvRow[] = [];

  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  let lineNumber = 1;
  let rowStartLine = 1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") {
          lineNumber++;
        }
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      if (currentCell.length === 0) {
        inQuotes = true;
      } else {
        issues.push({
          path: `${fileLabel}:line ${lineNumber}`,
          message: "Unexpected quote character inside unquoted CSV field.",
        });
      }
      continue;
    }

    if (ch === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (ch === "\r") {
      continue;
    }

    if (ch === "\n") {
      currentRow.push(currentCell);
      const isBlankLine =
        currentRow.length === 1 && (currentRow[0]?.trim().length ?? 0) === 0;
      if (!isBlankLine) {
        rows.push({ lineNumber: rowStartLine, cells: currentRow });
      }
      currentRow = [];
      currentCell = "";
      lineNumber++;
      rowStartLine = lineNumber;
      continue;
    }

    currentCell += ch;
  }

  if (inQuotes) {
    issues.push({
      path: `${fileLabel}:line ${rowStartLine}`,
      message: "Unclosed quoted CSV field at end of file.",
    });
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    const isBlankLine =
      currentRow.length === 1 && (currentRow[0]?.trim().length ?? 0) === 0;
    if (!isBlankLine) {
      rows.push({ lineNumber: rowStartLine, cells: currentRow });
    }
  }

  return rows;
}

function appendZodIssues(
  target: ValidationIssueDetail[],
  prefix: string,
  zodIssues: z.core.$ZodIssue[],
): void {
  for (const issue of zodIssues) {
    const subPath = issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
    target.push({
      path: `${prefix}${subPath}`,
      message: issue.message,
    });
  }
}

function parseEntitiesCsv(
  entitiesCsv: string,
  issues: ValidationIssueDetail[],
): EntitySeed[] {
  const rows = parseCsvRows(entitiesCsv, issues, "entities.csv");
  if (rows.length === 0) {
    issues.push({
      path: "entities.csv",
      message:
        "entities.csv is empty; expected header row: code,name_ar,name_en,entity_type,sector,status[,description].",
    });
    return [];
  }

  const headerRow = rows[0];
  if (!headerRow) {
    return [];
  }

  const headers = headerRow.cells.map((h) => h.trim());
  const seenHeaders = new Set<string>();

  for (const header of headers) {
    if (seenHeaders.has(header)) {
      issues.push({
        path: "entities.csv:header",
        message: `Duplicate CSV column header "${header}".`,
      });
    }
    seenHeaders.add(header);

    if (!ALLOWED_ENTITY_CSV_HEADERS.has(header)) {
      issues.push({
        path: "entities.csv:header",
        message: `Unknown CSV column header "${header}". Allowed headers: ${Array.from(ALLOWED_ENTITY_CSV_HEADERS).join(", ")}.`,
      });
    }
  }

  for (const requiredHeader of REQUIRED_ENTITY_CSV_HEADERS) {
    if (!seenHeaders.has(requiredHeader)) {
      issues.push({
        path: "entities.csv:header",
        message: `Missing required CSV column header "${requiredHeader}".`,
      });
    }
  }

  // Cannot reliably map cells if header definitions themselves are invalid
  const hasHeaderErrors = issues.some((i) =>
    i.path.startsWith("entities.csv:header"),
  );
  if (hasHeaderErrors) {
    return [];
  }

  const validEntities: EntitySeed[] = [];
  const seenEntityCodes = new Map<string, number>();

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row) {
      continue;
    }

    if (row.cells.length !== headers.length) {
      issues.push({
        path: `entities.csv:line ${row.lineNumber}`,
        message: `Expected ${headers.length} columns but found ${row.cells.length}.`,
      });
      continue;
    }

    const record: Record<string, string | undefined> = {};
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const colName = headers[colIdx];
      const cellValue = row.cells[colIdx]?.trim() ?? "";
      if (!colName) {
        continue;
      }
      if (colName === "description" && cellValue.length === 0) {
        record[colName] = undefined;
      } else {
        record[colName] = cellValue;
      }
    }

    const parsed = entitySeedSchema.safeParse(record);
    if (!parsed.success) {
      appendZodIssues(
        issues,
        `entities.csv:line ${row.lineNumber}`,
        parsed.error.issues,
      );
      continue;
    }

    const prevLine = seenEntityCodes.get(parsed.data.code);
    if (prevLine !== undefined) {
      issues.push({
        path: `entities.csv:line ${row.lineNumber}.code`,
        message: `Duplicate entity code "${parsed.data.code}" (already defined at line ${prevLine}).`,
      });
      continue;
    }

    seenEntityCodes.set(parsed.data.code, row.lineNumber);
    validEntities.push(parsed.data);
  }

  return validEntities;
}

function parseJsonArrayFile<T>(
  rawText: string,
  fileLabel: string,
  itemSchema: z.ZodType<T>,
  getCode: (item: T) => string,
  issues: ValidationIssueDetail[],
): T[] {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch (error) {
    issues.push({
      path: fileLabel,
      message: `Invalid JSON syntax: ${error instanceof Error ? error.message : String(error)}`,
    });
    return [];
  }

  if (!Array.isArray(parsedJson)) {
    issues.push({
      path: fileLabel,
      message: `Expected top-level JSON array in ${fileLabel}.`,
    });
    return [];
  }

  const validItems: T[] = [];
  const seenCodes = new Map<string, number>();

  for (let index = 0; index < parsedJson.length; index++) {
    const candidate = parsedJson[index];
    const parsed = itemSchema.safeParse(candidate);

    if (!parsed.success) {
      appendZodIssues(issues, `${fileLabel}[${index}]`, parsed.error.issues);
      continue;
    }

    const code = getCode(parsed.data);
    const prevIndex = seenCodes.get(code);
    if (prevIndex !== undefined) {
      issues.push({
        path: `${fileLabel}[${index}].code`,
        message: `Duplicate code "${code}" in ${fileLabel} (already defined at index ${prevIndex}).`,
      });
      continue;
    }

    seenCodes.set(code, index);
    validItems.push(parsed.data);
  }

  return validItems;
}

/**
 * Validates entities.csv, evidence.json, and facts.json together and reports
 * ALL schema, enum, duplicate-code, and cross-file reference errors at once.
 */
export function validateSeedSources(
  sources: RawSeedSources,
): ValidatedSeedBundle {
  const issues: ValidationIssueDetail[] = [];

  const entities = parseEntitiesCsv(sources.entitiesCsv, issues);
  const evidence = parseJsonArrayFile(
    sources.evidenceJsonText,
    "evidence.json",
    evidenceSeedSchema,
    (item) => item.code,
    issues,
  );
  const facts = parseJsonArrayFile(
    sources.factsJsonText,
    "facts.json",
    factSeedSchema,
    (item) => item.code,
    issues,
  );

  // Cross-file referential checks against known entity & evidence codes
  const knownEntityCodes = new Set(entities.map((e) => e.code));
  const knownEvidenceCodes = new Set(evidence.map((ev) => ev.code));

  for (let idx = 0; idx < facts.length; idx++) {
    const fact = facts[idx];
    if (!fact) {
      continue;
    }

    if (!knownEntityCodes.has(fact.entity_code)) {
      issues.push({
        path: `facts.json[${idx}].entity_code`,
        message: `Unknown entity_code "${fact.entity_code}" referenced by fact "${fact.code}" (not found in entities.csv).`,
      });
    }

    for (let evIdx = 0; evIdx < fact.evidence_codes.length; evIdx++) {
      const evCode = fact.evidence_codes[evIdx];
      if (evCode && !knownEvidenceCodes.has(evCode)) {
        issues.push({
          path: `facts.json[${idx}].evidence_codes.${evIdx}`,
          message: `Unknown evidence_code "${evCode}" referenced by fact "${fact.code}" (not found in evidence.json).`,
        });
      }
    }
  }

  if (issues.length > 0) {
    throw new SeedValidationError(
      `Seed validation failed with ${issues.length} error(s):\n` +
        issues.map((i) => `  - [${i.path}] ${i.message}`).join("\n"),
      issues,
    );
  }

  return {
    entities,
    evidence,
    facts,
  };
}

export async function loadAndValidateSeedDir(
  seedDir = path.resolve(process.cwd(), "data/seed"),
): Promise<ValidatedSeedBundle> {
  const entitiesPath = path.join(seedDir, "entities.csv");
  const evidencePath = path.join(seedDir, "evidence.json");
  const factsPath = path.join(seedDir, "facts.json");

  const fileReadIssues: ValidationIssueDetail[] = [];

  const readRequired = async (
    fullPath: string,
    label: string,
  ): Promise<string | null> => {
    try {
      return await readFile(fullPath, "utf8");
    } catch (error) {
      fileReadIssues.push({
        path: label,
        message: `Cannot read required seed file at ${fullPath}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return null;
    }
  };

  const [entitiesCsv, evidenceJsonText, factsJsonText] = await Promise.all([
    readRequired(entitiesPath, "entities.csv"),
    readRequired(evidencePath, "evidence.json"),
    readRequired(factsPath, "facts.json"),
  ]);

  if (
    fileReadIssues.length > 0 ||
    entitiesCsv === null ||
    evidenceJsonText === null ||
    factsJsonText === null
  ) {
    throw new SeedValidationError(
      `Missing or unreadable seed file(s) in ${seedDir}:\n` +
        fileReadIssues.map((i) => `  - [${i.path}] ${i.message}`).join("\n"),
      fileReadIssues,
    );
  }

  return validateSeedSources({
    entitiesCsv,
    evidenceJsonText,
    factsJsonText,
  });
}

const defaultSessionFactory = (): SeedDbSession => {
  const client = createNeonSessionClient();
  return {
    async connect() {
      await client.connect();
    },
    async query<Row = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) {
      const result = values
        ? await client.query(text, values)
        : await client.query(text);
      return { rows: result.rows as Row[] };
    },
    async end() {
      await client.end();
    },
  };
};

/**
 * Upserts a validated seed bundle idempotently by `code` within a single
 * PostgreSQL transaction, preserving side-by-side conflicting facts and
 * synchronizing many-to-many `fact_evidence` links.
 */
export async function upsertValidatedSeedBundle(
  bundle: ValidatedSeedBundle,
  sessionFactory: () => SeedDbSession = defaultSessionFactory,
): Promise<{
  entitiesCount: number;
  evidenceCount: number;
  factsCount: number;
  factEvidenceLinksCount: number;
}> {
  const session = sessionFactory();
  await session.connect();

  try {
    await session.query("BEGIN");

    const entityIdByCode = new Map<string, string>();
    for (const entity of bundle.entities) {
      const res = await session.query<{ id: string; code: string }>(
        `
        INSERT INTO entities (code, name_ar, name_en, entity_type, sector, status, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (code) DO UPDATE SET
          name_ar = EXCLUDED.name_ar,
          name_en = EXCLUDED.name_en,
          entity_type = EXCLUDED.entity_type,
          sector = EXCLUDED.sector,
          status = EXCLUDED.status,
          description = EXCLUDED.description
        RETURNING id, code
        `,
        [
          entity.code,
          entity.name_ar,
          entity.name_en,
          entity.entity_type,
          entity.sector,
          entity.status,
          entity.description,
        ],
      );
      const row = res.rows[0];
      if (!row?.id) {
        throw new Error(`Upsert did not return id for entity "${entity.code}".`);
      }
      entityIdByCode.set(entity.code, row.id);
    }

    const evidenceIdByCode = new Map<string, string>();
    for (const ev of bundle.evidence) {
      const res = await session.query<{ id: string; code: string }>(
        `
        INSERT INTO evidence (code, title, url, publisher, source_type, published_date, accessed_date, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (code) DO UPDATE SET
          title = EXCLUDED.title,
          url = EXCLUDED.url,
          publisher = EXCLUDED.publisher,
          source_type = EXCLUDED.source_type,
          published_date = EXCLUDED.published_date,
          accessed_date = EXCLUDED.accessed_date,
          notes = EXCLUDED.notes
        RETURNING id, code
        `,
        [
          ev.code,
          ev.title,
          ev.url,
          ev.publisher,
          ev.source_type,
          ev.published_date,
          ev.accessed_date,
          ev.notes,
        ],
      );
      const row = res.rows[0];
      if (!row?.id) {
        throw new Error(`Upsert did not return id for evidence "${ev.code}".`);
      }
      evidenceIdByCode.set(ev.code, row.id);
    }

    let factEvidenceLinksCount = 0;

    for (const fact of bundle.facts) {
      const entityId = entityIdByCode.get(fact.entity_code);
      if (!entityId) {
        throw new Error(
          `Missing resolved entity UUID for code "${fact.entity_code}".`,
        );
      }

      const factRes = await session.query<{ id: string; code: string }>(
        `
        INSERT INTO facts (code, entity_id, attribute, value, unit, valid_as_of, verification_state, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (code) DO UPDATE SET
          entity_id = EXCLUDED.entity_id,
          attribute = EXCLUDED.attribute,
          value = EXCLUDED.value,
          unit = EXCLUDED.unit,
          valid_as_of = EXCLUDED.valid_as_of,
          verification_state = EXCLUDED.verification_state,
          notes = EXCLUDED.notes
        RETURNING id, code
        `,
        [
          fact.code,
          entityId,
          fact.attribute,
          fact.value,
          fact.unit,
          fact.valid_as_of,
          fact.verification_state,
          fact.notes,
        ],
      );

      const factRow = factRes.rows[0];
      if (!factRow?.id) {
        throw new Error(`Upsert did not return id for fact "${fact.code}".`);
      }

      const resolvedEvidenceIds: string[] = [];
      for (const evCode of fact.evidence_codes) {
        const evId = evidenceIdByCode.get(evCode);
        if (!evId) {
          throw new Error(
            `Missing resolved evidence UUID for code "${evCode}".`,
          );
        }
        resolvedEvidenceIds.push(evId);
      }

      await session.query(
        `DELETE FROM fact_evidence WHERE fact_id = $1 AND NOT (evidence_id = ANY($2::uuid[]))`,
        [factRow.id, resolvedEvidenceIds],
      );

      for (const evId of resolvedEvidenceIds) {
        await session.query(
          `
          INSERT INTO fact_evidence (fact_id, evidence_id)
          VALUES ($1, $2)
          ON CONFLICT (fact_id, evidence_id) DO NOTHING
          `,
          [factRow.id, evId],
        );
        factEvidenceLinksCount++;
      }
    }

    await session.query("COMMIT");

    return {
      entitiesCount: bundle.entities.length,
      evidenceCount: bundle.evidence.length,
      factsCount: bundle.facts.length,
      factEvidenceLinksCount,
    };
  } catch (error) {
    await session.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await session.end().catch(() => undefined);
  }
}

export async function runSeedImport(
  options: RunSeedImportOptions = {},
): Promise<SeedImportSummary> {
  const seedDir =
    options.seedDir ?? path.resolve(process.cwd(), "data/seed");
  const dryRun = options.dryRun ?? false;

  const bundle = await loadAndValidateSeedDir(seedDir);
  const linkCount = bundle.facts.reduce(
    (sum, fact) => sum + fact.evidence_codes.length,
    0,
  );

  if (dryRun) {
    logger.info("Validated seed bundle in dry-run mode", {
      seedDir,
      entitiesCount: bundle.entities.length,
      evidenceCount: bundle.evidence.length,
      factsCount: bundle.facts.length,
      factEvidenceLinksCount: linkCount,
    });
    return {
      dryRun: true,
      seedDir,
      entitiesCount: bundle.entities.length,
      evidenceCount: bundle.evidence.length,
      factsCount: bundle.facts.length,
      factEvidenceLinksCount: linkCount,
    };
  }

  const counts = await upsertValidatedSeedBundle(
    bundle,
    options.sessionFactory,
  );

  logger.info("Seed bundle imported idempotently", {
    seedDir,
    ...counts,
  });

  return {
    dryRun: false,
    seedDir,
    ...counts,
  };
}
