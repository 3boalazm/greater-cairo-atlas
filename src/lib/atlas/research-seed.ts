import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  atlasCodeSchema,
  canVerifyFactWithSources,
  entitySectorSchema,
  entitySeedSchema,
  entityStatusSchema,
  entityTypeSchema,
  evidenceSeedSchema,
  evidenceSourceTypeSchema,
  factAttributeSchema,
  factSeedSchema,
  factVerificationStateSchema,
  httpUrlSchema,
  isoDateStringSchema,
  nonEmptyTrimmedTextSchema,
  parsePartialIsoDate,
  type DatePrecision,
  type EntitySeed,
  type EvidenceSeed,
  type EvidenceSourceType,
  type FactSeed,
} from "@/lib/atlas/schema";
import {
  parseCsvRows,
  serializeEntitiesCsv,
  summarizeValidatedSeedBundle,
  validateSeedSources,
  type SeedBundleReport,
  type ValidatedSeedBundle,
} from "@/lib/atlas/seed";
import {
  SeedValidationError,
  type ValidationIssueDetail,
} from "@/lib/errors";

const REQUIRED_RESEARCH_ENTITY_HEADERS = [
  "entity_code",
  "entity_type",
  "canonical_name_ar",
  "canonical_name_en",
  "aliases",
  "sector_code",
] as const;

const ALLOWED_RESEARCH_ENTITY_HEADERS = new Set<string>([
  ...REQUIRED_RESEARCH_ENTITY_HEADERS,
  "status",
  "description",
]);

const ALLOWED_RESEARCH_EVIDENCE_KEYS = new Set<string>([
  "evidence_ref",
  "source_url",
  "publisher",
  "title",
  "note",
  "source_type",
  "published_date",
  "accessed_date",
]);

const ALLOWED_RESEARCH_FACT_KEYS = new Set<string>([
  "entity_code",
  "attribute_key",
  "value",
  "unit",
  "status_as_of",
  "verification_state",
  "evidence_ref",
  "note",
  "notes",
]);

export type DetectedAliasSeparator = "|" | ";" | "،" | "," | "json" | "none";

export interface RawResearchSeedSources {
  entitiesCsv: string;
  evidenceJsonText: string;
  factsJsonText: string;
  selectedRevision?: string;
}

export interface SecondaryOnlyVerifiedFactFailure {
  index: number;
  factCode: string;
  entityCode: string;
  attribute: string;
  evidenceCodes: string[];
}

export interface ResearchSeedAdaptationReport {
  ok: boolean;
  selectedRevision: string;
  detectedAliasSeparator: DetectedAliasSeparator;
  counts: {
    entities: number;
    entitiesWithAliases: number;
    missingStatusDefaultedToUnknown: number;
    evidence: number;
    evidenceMissingUrl: number;
    facts: number;
    factEvidenceLinks: number;
    factDatePrecisions: Record<DatePrecision | "null", number>;
    evidencePublishedDatePrecisions: Record<DatePrecision | "null", number>;
  };
  missingSourceTypeEvidenceRefs: string[];
  secondaryOnlyVerifiedFacts: SecondaryOnlyVerifiedFactFailure[];
  bundleReport: SeedBundleReport | null;
  issues: ValidationIssueDetail[];
}

export interface ResearchSeedAdaptationResult {
  ok: boolean;
  report: ResearchSeedAdaptationReport;
  bundle: ValidatedSeedBundle | null;
  serialized: {
    entitiesCsv: string;
    evidenceJsonText: string;
    factsJsonText: string;
  } | null;
}

export interface ResolvedResearchInputFiles {
  selectedRevision: string;
  entitiesPath: string;
  evidencePath: string;
  factsPath: string;
}

export interface RunAdaptResearchSeedOptions {
  inputDir?: string;
  revision?: number;
  entitiesPath?: string;
  evidencePath?: string;
  factsPath?: string;
  outDir?: string;
  reportPath?: string;
  dryRun?: boolean;
}

function compareLex(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/**
 * Detects the alias separator used across non-empty `aliases` cells in research CSV files.
 * Priority order: JSON array ("[...]") -> "|" -> ";" -> "،" -> "," -> "none".
 */
export function detectAliasSeparator(
  rawAliasCells: readonly string[],
): DetectedAliasSeparator {
  const nonEmpty = rawAliasCells
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);

  if (nonEmpty.length === 0) {
    return "none";
  }

  const allJsonArrays = nonEmpty.every(
    (cell) => cell.startsWith("[") && cell.endsWith("]"),
  );
  if (allJsonArrays) {
    return "json";
  }

  const candidateDelimiters: Array<"|" | ";" | "،" | ","> = [
    "|",
    ";",
    "،",
    ",",
  ];
  for (const delim of candidateDelimiters) {
    if (nonEmpty.some((cell) => cell.includes(delim))) {
      return delim;
    }
  }

  return "none";
}

/**
 * Splits a single `aliases` cell according to the detected separator, trimming
 * whitespace and deduplicating exact duplicates while preserving order.
 */
export function splitAliasesCell(
  rawCell: string,
  separator: DetectedAliasSeparator,
  issuePath: string,
  issues: ValidationIssueDetail[],
): string[] {
  const trimmed = rawCell.trim();
  if (trimmed.length === 0) {
    return [];
  }

  let tokens: string[] = [];

  if (separator === "json") {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (
        !Array.isArray(parsed) ||
        !parsed.every((item) => typeof item === "string")
      ) {
        issues.push({
          path: issuePath,
          message: "JSON aliases cell must be an array of strings.",
        });
        return [];
      }
      tokens = parsed;
    } catch (error) {
      issues.push({
        path: issuePath,
        message: `Invalid JSON aliases array: ${error instanceof Error ? error.message : String(error)}`,
      });
      return [];
    }
  } else if (separator === "none") {
    tokens = [trimmed];
  } else {
    tokens = trimmed.split(separator);
  }

  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const rawToken of tokens) {
    const cleaned = rawToken.trim();
    if (cleaned.length === 0) {
      continue;
    }
    if (cleaned.includes("|")) {
      issues.push({
        path: issuePath,
        message: `Alias "${cleaned}" contains reserved canonical pipe character "|".`,
      });
      continue;
    }
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      deduped.push(cleaned);
    }
  }

  return deduped;
}

/**
 * Builds a deterministic, run-stable canonical fact code of the form:
 *   F-<ENTITY_CODE>-<ATTRIBUTE_UPPER_HYPHEN>-<N>
 * Falls back to a deterministic SHA-256 short digest only when total length would exceed 120 chars.
 */
export function buildDeterministicFactCode(
  entityCode: string,
  attributeKey: string,
  sequenceNumber: number,
): string {
  const attrSegment = attributeKey
    .trim()
    .toUpperCase()
    .replace(/_+/g, "-");
  const suffix = `-${sequenceNumber}`;
  const candidate = `F-${entityCode}-${attrSegment}${suffix}`;

  if (candidate.length <= 120) {
    return candidate;
  }

  const attrHash = createHash("sha256")
    .update(`${entityCode}:${attributeKey}`)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
  const maxAttrLen = Math.max(
    4,
    120 - `F-${entityCode}--${attrHash}${suffix}`.length,
  );
  const truncatedAttr = attrSegment
    .slice(0, maxAttrLen)
    .replace(/-+$/g, "");
  return `F-${entityCode}-${truncatedAttr}-${attrHash}${suffix}`;
}

interface IntermediateFactCandidate {
  originalIndex: number;
  entityCode: string;
  attribute: string;
  value: string;
  unit: string | null;
  rawStatusAsOf: string | null;
  validAsOf: string | null;
  validAsOfPrecision: DatePrecision;
  verificationState: FactSeed["verification_state"];
  evidenceCodes: string[];
  notes: string | null;
}

function adaptResearchEntitiesCsv(
  entitiesCsv: string,
  issues: ValidationIssueDetail[],
): {
  entities: EntitySeed[];
  detectedAliasSeparator: DetectedAliasSeparator;
  missingStatusDefaultedToUnknown: number;
} {
  const rows = parseCsvRows(entitiesCsv, issues, "entities.csv");
  if (rows.length === 0) {
    issues.push({
      path: "entities.csv",
      message:
        "Research entities.csv is empty; expected header row with entity_code,entity_type,canonical_name_ar,canonical_name_en,aliases,sector_code[,status][,description].",
    });
    return {
      entities: [],
      detectedAliasSeparator: "none",
      missingStatusDefaultedToUnknown: 0,
    };
  }

  const headerRow = rows[0];
  if (!headerRow) {
    return {
      entities: [],
      detectedAliasSeparator: "none",
      missingStatusDefaultedToUnknown: 0,
    };
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
    if (!ALLOWED_RESEARCH_ENTITY_HEADERS.has(header)) {
      issues.push({
        path: "entities.csv:header",
        message: `Unknown research CSV column header "${header}". Allowed headers: ${Array.from(ALLOWED_RESEARCH_ENTITY_HEADERS).join(", ")}.`,
      });
    }
  }

  for (const required of REQUIRED_RESEARCH_ENTITY_HEADERS) {
    if (!seenHeaders.has(required)) {
      issues.push({
        path: "entities.csv:header",
        message: `Missing required research CSV column header "${required}".`,
      });
    }
  }

  if (issues.some((i) => i.path.startsWith("entities.csv:header"))) {
    return {
      entities: [],
      detectedAliasSeparator: "none",
      missingStatusDefaultedToUnknown: 0,
    };
  }

  const aliasesColIdx = headers.indexOf("aliases");
  const rawAliasCells: string[] = [];
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (row && aliasesColIdx >= 0 && row.cells.length === headers.length) {
      rawAliasCells.push(row.cells[aliasesColIdx] ?? "");
    }
  }

  const detectedAliasSeparator = detectAliasSeparator(rawAliasCells);
  const entities: EntitySeed[] = [];
  const seenCodes = new Map<string, number>();
  let missingStatusDefaultedToUnknown = 0;

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

    const byCol: Record<string, string> = {};
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const colName = headers[colIdx];
      if (colName) {
        byCol[colName] = row.cells[colIdx]?.trim() ?? "";
      }
    }

    const rawCode = byCol.entity_code ?? "";
    const rawType = byCol.entity_type ?? "";
    const rawNameAr = byCol.canonical_name_ar ?? "";
    const rawNameEn = byCol.canonical_name_en ?? "";
    const rawAliases = byCol.aliases ?? "";
    const rawSector = byCol.sector_code ?? "";
    const rawStatus = byCol.status;
    const rawDescription = byCol.description ?? "";

    // Epistemic rule: missing or blank status -> 'unknown' (never guessed as 'operational')
    let resolvedStatusValue: string;
    if (rawStatus === undefined || rawStatus.length === 0) {
      resolvedStatusValue = "unknown";
      missingStatusDefaultedToUnknown++;
    } else {
      resolvedStatusValue = rawStatus;
    }

    const rowPrefix = `entities.csv:line ${row.lineNumber}`;
    let rowValid = true;

    const codeParsed = atlasCodeSchema.safeParse(rawCode);
    if (!codeParsed.success) {
      rowValid = false;
      issues.push({
        path: `${rowPrefix}.entity_code`,
        message:
          codeParsed.error.issues[0]?.message ??
          `Invalid entity_code "${rawCode}".`,
      });
    }

    const nameArParsed = nonEmptyTrimmedTextSchema.safeParse(rawNameAr);
    if (!nameArParsed.success) {
      rowValid = false;
      issues.push({
        path: `${rowPrefix}.canonical_name_ar`,
        message: "canonical_name_ar must not be empty.",
      });
    }

    const nameEnParsed = nonEmptyTrimmedTextSchema.safeParse(rawNameEn);
    if (!nameEnParsed.success) {
      rowValid = false;
      issues.push({
        path: `${rowPrefix}.canonical_name_en`,
        message: "canonical_name_en must not be empty.",
      });
    }

    const typeParsed = entityTypeSchema.safeParse(rawType);
    if (!typeParsed.success) {
      rowValid = false;
      issues.push({
        path: `${rowPrefix}.entity_type`,
        message: `Invalid entity_type "${rawType}".`,
      });
    }

    const sectorParsed = entitySectorSchema.safeParse(rawSector);
    if (!sectorParsed.success) {
      rowValid = false;
      issues.push({
        path: `${rowPrefix}.sector_code`,
        message: `Invalid sector_code "${rawSector}".`,
      });
    }

    const statusParsed = entityStatusSchema.safeParse(resolvedStatusValue);
    if (!statusParsed.success) {
      rowValid = false;
      issues.push({
        path: `${rowPrefix}.status`,
        message: `Invalid status "${resolvedStatusValue}".`,
      });
    }

    const aliasesBeforeIssues = issues.length;
    const aliases = splitAliasesCell(
      rawAliases,
      detectedAliasSeparator,
      `${rowPrefix}.aliases`,
      issues,
    );
    if (issues.length > aliasesBeforeIssues) {
      rowValid = false;
    }

    if (!rowValid) {
      continue;
    }

    const parsedSeed = entitySeedSchema.safeParse({
      code: codeParsed.data,
      name_ar: nameArParsed.data,
      name_en: nameEnParsed.data,
      entity_type: typeParsed.data,
      sector: sectorParsed.data,
      status: statusParsed.data,
      aliases,
      description: rawDescription.length === 0 ? null : rawDescription,
    });

    if (!parsedSeed.success) {
      for (const zIssue of parsedSeed.error.issues) {
        issues.push({
          path: `${rowPrefix}.${zIssue.path.join(".")}`,
          message: zIssue.message,
        });
      }
      continue;
    }

    const prevLine = seenCodes.get(parsedSeed.data.code);
    if (prevLine !== undefined) {
      issues.push({
        path: `${rowPrefix}.entity_code`,
        message: `Duplicate entity_code "${parsedSeed.data.code}" (already defined at line ${prevLine}).`,
      });
      continue;
    }

    seenCodes.set(parsedSeed.data.code, row.lineNumber);
    entities.push(parsedSeed.data);
  }

  return {
    entities,
    detectedAliasSeparator,
    missingStatusDefaultedToUnknown,
  };
}

function adaptResearchEvidenceJson(
  evidenceJsonText: string,
  issues: ValidationIssueDetail[],
): {
  evidence: EvidenceSeed[];
  missingSourceTypeEvidenceRefs: string[];
  evidencePublishedDatePrecisions: Record<DatePrecision | "null", number>;
} {
  const precisions: Record<DatePrecision | "null", number> = {
    day: 0,
    month: 0,
    year: 0,
    null: 0,
  };
  const missingSourceTypeRefs: string[] = [];

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(evidenceJsonText);
  } catch (error) {
    issues.push({
      path: "evidence.json",
      message: `Invalid JSON syntax: ${error instanceof Error ? error.message : String(error)}`,
    });
    return {
      evidence: [],
      missingSourceTypeEvidenceRefs: [],
      evidencePublishedDatePrecisions: precisions,
    };
  }

  if (!Array.isArray(parsedJson)) {
    issues.push({
      path: "evidence.json",
      message: "Expected top-level JSON array in research evidence.json.",
    });
    return {
      evidence: [],
      missingSourceTypeEvidenceRefs: [],
      evidencePublishedDatePrecisions: precisions,
    };
  }

  const evidence: EvidenceSeed[] = [];
  const seenCodes = new Map<string, number>();

  for (let idx = 0; idx < parsedJson.length; idx++) {
    const rawItem = parsedJson[idx];
    const prefix = `evidence.json[${idx}]`;

    if (
      rawItem === null ||
      typeof rawItem !== "object" ||
      Array.isArray(rawItem)
    ) {
      issues.push({
        path: prefix,
        message: "Expected evidence entry to be a JSON object.",
      });
      continue;
    }

    const record = rawItem as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!ALLOWED_RESEARCH_EVIDENCE_KEYS.has(key)) {
        issues.push({
          path: `${prefix}.${key}`,
          message: `Unknown field "${key}" in research evidence record.`,
        });
      }
    }

    const rawRef =
      typeof record.evidence_ref === "string" ? record.evidence_ref.trim() : "";
    const refLabel = rawRef.length > 0 ? rawRef : `index-${idx}`;

    let itemValid = true;

    const codeParsed = atlasCodeSchema.safeParse(rawRef);
    if (!codeParsed.success) {
      itemValid = false;
      issues.push({
        path: `${prefix}.evidence_ref`,
        message:
          codeParsed.error.issues[0]?.message ??
          `Invalid evidence_ref "${rawRef}".`,
      });
    }

    // Epistemic rule: missing source_type -> fail with a clear list (rev2 required before import)
    const rawSourceType = record.source_type;
    if (
      rawSourceType === undefined ||
      rawSourceType === null ||
      (typeof rawSourceType === "string" && rawSourceType.trim().length === 0)
    ) {
      itemValid = false;
      missingSourceTypeRefs.push(refLabel);
      issues.push({
        path: `${prefix}.source_type`,
        message: `Evidence "${refLabel}" is missing required "source_type" (rev2 evidence file with explicit source_type is required before import; never guessed).`,
      });
    } else if (typeof rawSourceType !== "string") {
      itemValid = false;
      issues.push({
        path: `${prefix}.source_type`,
        message: `Evidence "${refLabel}" has non-string source_type.`,
      });
    } else {
      const stParsed = evidenceSourceTypeSchema.safeParse(rawSourceType.trim());
      if (!stParsed.success) {
        itemValid = false;
        issues.push({
          path: `${prefix}.source_type`,
          message: `Invalid source_type "${rawSourceType}" on evidence "${refLabel}".`,
        });
      }
    }

    // accessed_date: required full YYYY-MM-DD (never guessed)
    const rawAccessedDate = record.accessed_date;
    let accessedDate: string | null = null;
    if (
      rawAccessedDate === undefined ||
      rawAccessedDate === null ||
      (typeof rawAccessedDate === "string" &&
        rawAccessedDate.trim().length === 0)
    ) {
      itemValid = false;
      issues.push({
        path: `${prefix}.accessed_date`,
        message: `Evidence "${refLabel}" is missing required "accessed_date" (YYYY-MM-DD; never guessed).`,
      });
    } else if (typeof rawAccessedDate !== "string") {
      itemValid = false;
      issues.push({
        path: `${prefix}.accessed_date`,
        message: `Evidence "${refLabel}" accessed_date must be a YYYY-MM-DD string.`,
      });
    } else {
      const accParsed = isoDateStringSchema.safeParse(rawAccessedDate);
      if (!accParsed.success) {
        itemValid = false;
        issues.push({
          path: `${prefix}.accessed_date`,
          message: `Invalid accessed_date "${rawAccessedDate}" on evidence "${refLabel}" (expected valid YYYY-MM-DD).`,
        });
      } else {
        accessedDate = accParsed.data;
      }
    }

    // published_date: optional, supports YYYY-MM-DD, YYYY-MM, or YYYY without inventing day
    const rawPublishedDate = record.published_date;
    let publishedDate: string | null = null;
    let publishedDatePrecision: DatePrecision = "day";
    if (
      rawPublishedDate === undefined ||
      rawPublishedDate === null ||
      (typeof rawPublishedDate === "string" &&
        rawPublishedDate.trim().length === 0)
    ) {
      publishedDate = null;
      publishedDatePrecision = "day";
    } else if (typeof rawPublishedDate !== "string") {
      itemValid = false;
      issues.push({
        path: `${prefix}.published_date`,
        message: `Evidence "${refLabel}" published_date must be a string or null.`,
      });
    } else {
      const parsedPartial = parsePartialIsoDate(rawPublishedDate);
      if (!parsedPartial) {
        itemValid = false;
        issues.push({
          path: `${prefix}.published_date`,
          message: `Invalid published_date "${rawPublishedDate}" on evidence "${refLabel}" (expected YYYY-MM-DD, YYYY-MM, or YYYY).`,
        });
      } else {
        publishedDate = parsedPartial.date;
        publishedDatePrecision = parsedPartial.precision;
      }
    }

    // source_url -> url (nullable when documented by title + publisher)
    const rawUrl = record.source_url;
    let url: string | null = null;
    if (
      rawUrl === undefined ||
      rawUrl === null ||
      (typeof rawUrl === "string" && rawUrl.trim().length === 0)
    ) {
      url = null;
    } else if (typeof rawUrl !== "string") {
      itemValid = false;
      issues.push({
        path: `${prefix}.source_url`,
        message: `Evidence "${refLabel}" source_url must be a string or null.`,
      });
    } else {
      const urlParsed = httpUrlSchema.safeParse(rawUrl);
      if (!urlParsed.success) {
        itemValid = false;
        issues.push({
          path: `${prefix}.source_url`,
          message:
            urlParsed.error.issues[0]?.message ??
            `Invalid source_url "${rawUrl}".`,
        });
      } else {
        url = urlParsed.data;
      }
    }

    const rawPublisher =
      typeof record.publisher === "string" ? record.publisher.trim() : "";
    if (rawPublisher.length === 0) {
      itemValid = false;
      issues.push({
        path: `${prefix}.publisher`,
        message: `Evidence "${refLabel}" publisher must not be empty.`,
      });
    }

    const rawTitle =
      record.title === undefined || record.title === null
        ? null
        : typeof record.title === "string"
          ? record.title.trim() || null
          : null;
    if (
      record.title !== undefined &&
      record.title !== null &&
      typeof record.title !== "string"
    ) {
      itemValid = false;
      issues.push({
        path: `${prefix}.title`,
        message: `Evidence "${refLabel}" title must be a string or null.`,
      });
    }

    const rawNote =
      record.note === undefined || record.note === null
        ? null
        : typeof record.note === "string"
          ? record.note.trim() || null
          : null;
    if (
      record.note !== undefined &&
      record.note !== null &&
      typeof record.note !== "string"
    ) {
      itemValid = false;
      issues.push({
        path: `${prefix}.note`,
        message: `Evidence "${refLabel}" note must be a string or null.`,
      });
    }

    if (!itemValid || accessedDate === null) {
      continue;
    }

    const parsedEvidence = evidenceSeedSchema.safeParse({
      code: codeParsed.data,
      title: rawTitle,
      url,
      publisher: rawPublisher,
      source_type: (rawSourceType as string).trim() as EvidenceSourceType,
      published_date: publishedDate,
      published_date_precision: publishedDatePrecision,
      accessed_date: accessedDate,
      notes: rawNote,
    });

    if (!parsedEvidence.success) {
      for (const zIssue of parsedEvidence.error.issues) {
        issues.push({
          path: `${prefix}.${zIssue.path.join(".")}`,
          message: zIssue.message,
        });
      }
      continue;
    }

    const prevIdx = seenCodes.get(parsedEvidence.data.code);
    if (prevIdx !== undefined) {
      issues.push({
        path: `${prefix}.evidence_ref`,
        message: `Duplicate evidence_ref "${parsedEvidence.data.code}" (already defined at index ${prevIdx}).`,
      });
      continue;
    }

    seenCodes.set(parsedEvidence.data.code, idx);
    if (parsedEvidence.data.published_date === null) {
      precisions.null++;
    } else {
      precisions[parsedEvidence.data.published_date_precision]++;
    }
    evidence.push(parsedEvidence.data);
  }

  return {
    evidence,
    missingSourceTypeEvidenceRefs: missingSourceTypeRefs,
    evidencePublishedDatePrecisions: precisions,
  };
}

function adaptResearchFactsJson(
  factsJsonText: string,
  entities: readonly EntitySeed[],
  evidence: readonly EvidenceSeed[],
  issues: ValidationIssueDetail[],
): {
  facts: FactSeed[];
  factDatePrecisions: Record<DatePrecision | "null", number>;
  secondaryOnlyVerifiedFacts: SecondaryOnlyVerifiedFactFailure[];
} {
  const precisions: Record<DatePrecision | "null", number> = {
    day: 0,
    month: 0,
    year: 0,
    null: 0,
  };
  const secondaryOnlyVerifiedFacts: SecondaryOnlyVerifiedFactFailure[] = [];

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(factsJsonText);
  } catch (error) {
    issues.push({
      path: "facts.json",
      message: `Invalid JSON syntax: ${error instanceof Error ? error.message : String(error)}`,
    });
    return {
      facts: [],
      factDatePrecisions: precisions,
      secondaryOnlyVerifiedFacts,
    };
  }

  if (!Array.isArray(parsedJson)) {
    issues.push({
      path: "facts.json",
      message: "Expected top-level JSON array in research facts.json.",
    });
    return {
      facts: [],
      factDatePrecisions: precisions,
      secondaryOnlyVerifiedFacts,
    };
  }

  const candidates: IntermediateFactCandidate[] = [];

  for (let idx = 0; idx < parsedJson.length; idx++) {
    const rawItem = parsedJson[idx];
    const prefix = `facts.json[${idx}]`;

    if (
      rawItem === null ||
      typeof rawItem !== "object" ||
      Array.isArray(rawItem)
    ) {
      issues.push({
        path: prefix,
        message: "Expected fact entry to be a JSON object.",
      });
      continue;
    }

    const record = rawItem as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!ALLOWED_RESEARCH_FACT_KEYS.has(key)) {
        issues.push({
          path: `${prefix}.${key}`,
          message: `Unknown field "${key}" in research fact record.`,
        });
      }
    }

    let itemValid = true;

    const rawEntityCode =
      typeof record.entity_code === "string" ? record.entity_code.trim() : "";
    const entityCodeParsed = atlasCodeSchema.safeParse(rawEntityCode);
    if (!entityCodeParsed.success) {
      itemValid = false;
      issues.push({
        path: `${prefix}.entity_code`,
        message:
          entityCodeParsed.error.issues[0]?.message ??
          `Invalid entity_code "${rawEntityCode}".`,
      });
    }

    const rawAttr =
      typeof record.attribute_key === "string"
        ? record.attribute_key.trim()
        : "";
    const attrParsed = factAttributeSchema.safeParse(rawAttr);
    if (!attrParsed.success) {
      itemValid = false;
      issues.push({
        path: `${prefix}.attribute_key`,
        message:
          attrParsed.error.issues[0]?.message ??
          `Invalid attribute_key "${rawAttr}".`,
      });
    }

    // value: string | number | boolean -> non-empty string
    const rawVal = record.value;
    let serializedValue = "";
    if (typeof rawVal === "string") {
      serializedValue = rawVal.trim();
      if (serializedValue.length === 0) {
        itemValid = false;
        issues.push({
          path: `${prefix}.value`,
          message: "Fact value string must not be empty.",
        });
      }
    } else if (typeof rawVal === "number") {
      if (!Number.isFinite(rawVal)) {
        itemValid = false;
        issues.push({
          path: `${prefix}.value`,
          message: "Fact numeric value must be finite.",
        });
      } else {
        serializedValue = String(rawVal);
      }
    } else if (typeof rawVal === "boolean") {
      serializedValue = String(rawVal);
    } else {
      itemValid = false;
      issues.push({
        path: `${prefix}.value`,
        message:
          "Fact value must be a non-empty string, finite number, or boolean.",
      });
    }

    // unit: string | null | undefined
    let unit: string | null = null;
    if (record.unit !== undefined && record.unit !== null) {
      if (typeof record.unit !== "string") {
        itemValid = false;
        issues.push({
          path: `${prefix}.unit`,
          message: "Fact unit must be a string or null.",
        });
      } else {
        unit = record.unit.trim() || null;
      }
    }

    // status_as_of -> valid_as_of + valid_as_of_precision (day | month | year)
    let rawStatusAsOf: string | null = null;
    let validAsOf: string | null = null;
    let validAsOfPrecision: DatePrecision = "day";

    if (
      record.status_as_of === undefined ||
      record.status_as_of === null ||
      (typeof record.status_as_of === "string" &&
        record.status_as_of.trim().length === 0)
    ) {
      rawStatusAsOf = null;
      validAsOf = null;
      validAsOfPrecision = "day";
    } else if (typeof record.status_as_of !== "string") {
      itemValid = false;
      issues.push({
        path: `${prefix}.status_as_of`,
        message: "Fact status_as_of must be a string or null.",
      });
    } else {
      rawStatusAsOf = record.status_as_of.trim();
      const parsedPartial = parsePartialIsoDate(rawStatusAsOf);
      if (!parsedPartial) {
        itemValid = false;
        issues.push({
          path: `${prefix}.status_as_of`,
          message: `Invalid status_as_of "${rawStatusAsOf}" (expected YYYY-MM-DD, YYYY-MM, or YYYY; partial dates are never guessed beyond year/month).`,
        });
      } else {
        validAsOf = parsedPartial.date;
        validAsOfPrecision = parsedPartial.precision;
      }
    }

    // verification_state
    const rawState =
      typeof record.verification_state === "string"
        ? record.verification_state.trim()
        : "";
    const stateParsed = factVerificationStateSchema.safeParse(rawState);
    if (!stateParsed.success) {
      itemValid = false;
      issues.push({
        path: `${prefix}.verification_state`,
        message: `Invalid verification_state "${rawState}".`,
      });
    }

    // evidence_ref: string | string[]
    const rawEvidenceRef = record.evidence_ref;
    const evidenceCodes: string[] = [];
    if (typeof rawEvidenceRef === "string") {
      const evParsed = atlasCodeSchema.safeParse(rawEvidenceRef);
      if (!evParsed.success) {
        itemValid = false;
        issues.push({
          path: `${prefix}.evidence_ref`,
          message:
            evParsed.error.issues[0]?.message ??
            `Invalid evidence_ref "${rawEvidenceRef}".`,
        });
      } else {
        evidenceCodes.push(evParsed.data);
      }
    } else if (Array.isArray(rawEvidenceRef)) {
      if (rawEvidenceRef.length === 0) {
        itemValid = false;
        issues.push({
          path: `${prefix}.evidence_ref`,
          message: "evidence_ref array must contain at least one evidence code.",
        });
      } else {
        const seenInFact = new Set<string>();
        for (let evIdx = 0; evIdx < rawEvidenceRef.length; evIdx++) {
          const entry = rawEvidenceRef[evIdx];
          if (typeof entry !== "string") {
            itemValid = false;
            issues.push({
              path: `${prefix}.evidence_ref.${evIdx}`,
              message: "evidence_ref array elements must be strings.",
            });
            continue;
          }
          const evParsed = atlasCodeSchema.safeParse(entry);
          if (!evParsed.success) {
            itemValid = false;
            issues.push({
              path: `${prefix}.evidence_ref.${evIdx}`,
              message:
                evParsed.error.issues[0]?.message ??
                `Invalid evidence_ref "${entry}".`,
            });
            continue;
          }
          if (seenInFact.has(evParsed.data)) {
            itemValid = false;
            issues.push({
              path: `${prefix}.evidence_ref.${evIdx}`,
              message: `Duplicate evidence_ref "${evParsed.data}" inside single fact.`,
            });
            continue;
          }
          seenInFact.add(evParsed.data);
          evidenceCodes.push(evParsed.data);
        }
      }
    } else {
      itemValid = false;
      issues.push({
        path: `${prefix}.evidence_ref`,
        message:
          "evidence_ref is required and must be an evidence code string or non-empty array of strings.",
      });
    }

    const rawNotes = record.notes ?? record.note;
    let notes: string | null = null;
    if (rawNotes !== undefined && rawNotes !== null) {
      if (typeof rawNotes !== "string") {
        itemValid = false;
        issues.push({
          path: `${prefix}.notes`,
          message: "Fact note/notes must be a string or null.",
        });
      } else {
        notes = rawNotes.trim() || null;
      }
    }

    if (!itemValid || !stateParsed.success) {
      continue;
    }

    candidates.push({
      originalIndex: idx,
      entityCode: entityCodeParsed.data!,
      attribute: attrParsed.data!,
      value: serializedValue,
      unit,
      rawStatusAsOf,
      validAsOf,
      validAsOfPrecision,
      verificationState: stateParsed.data,
      evidenceCodes,
      notes,
    });
  }

  // Group by (entityCode, attribute) to assign deterministic, order-independent sequence numbers
  const entityOrder = new Map<string, number>();
  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i];
    if (ent) {
      entityOrder.set(ent.code, i);
    }
  }

  const groups = new Map<string, IntermediateFactCandidate[]>();
  for (const cand of candidates) {
    const groupKey = `${cand.entityCode}\u0000${cand.attribute}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.push(cand);
    } else {
      groups.set(groupKey, [cand]);
    }
  }

  const sortedGroupKeys = Array.from(groups.keys()).sort((a, b) => {
    const [entA = "", attrA = ""] = a.split("\u0000");
    const [entB = "", attrB = ""] = b.split("\u0000");
    const ordA = entityOrder.get(entA) ?? Number.MAX_SAFE_INTEGER;
    const ordB = entityOrder.get(entB) ?? Number.MAX_SAFE_INTEGER;
    if (ordA !== ordB) {
      return ordA - ordB;
    }
    const entCmp = compareLex(entA, entB);
    if (entCmp !== 0) {
      return entCmp;
    }
    return compareLex(attrA, attrB);
  });

  const knownEntityCodes = new Set(entities.map((e) => e.code));
  const evidenceByCode = new Map(evidence.map((ev) => [ev.code, ev]));
  const adaptedFacts: FactSeed[] = [];

  for (const groupKey of sortedGroupKeys) {
    const groupItems = groups.get(groupKey);
    if (!groupItems) {
      continue;
    }

    // Sort independent of JSON array position AND independent of verification_state
    // so verification upgrades/downgrades preserve the exact same fact code.
    groupItems.sort((a, b) => {
      const valCmp = compareLex(a.value, b.value);
      if (valCmp !== 0) return valCmp;
      const unitCmp = compareLex(a.unit ?? "", b.unit ?? "");
      if (unitCmp !== 0) return unitCmp;
      const evKeyA = [...a.evidenceCodes].sort(compareLex).join(",");
      const evKeyB = [...b.evidenceCodes].sort(compareLex).join(",");
      const evCmp = compareLex(evKeyA, evKeyB);
      if (evCmp !== 0) return evCmp;
      const dateCmp = compareLex(a.rawStatusAsOf ?? "", b.rawStatusAsOf ?? "");
      if (dateCmp !== 0) return dateCmp;
      return compareLex(a.notes ?? "", b.notes ?? "");
    });

    const seenIdentities = new Map<string, number>();

    for (let seqIdx = 0; seqIdx < groupItems.length; seqIdx++) {
      const item = groupItems[seqIdx];
      if (!item) {
        continue;
      }

      const sortedEvCodes = [...item.evidenceCodes].sort(compareLex);
      const identitySignature = JSON.stringify([
        item.entityCode,
        item.attribute,
        item.value,
        item.unit ?? "",
        sortedEvCodes,
        item.rawStatusAsOf ?? "",
        item.notes ?? "",
      ]);

      const duplicateOf = seenIdentities.get(identitySignature);
      if (duplicateOf !== undefined) {
        issues.push({
          path: `facts.json[${item.originalIndex}]`,
          message: `Exact duplicate fact entry for (${item.entityCode}, ${item.attribute}, value="${item.value}") matching facts.json[${duplicateOf}].`,
        });
        continue;
      }
      seenIdentities.set(identitySignature, item.originalIndex);

      const code = buildDeterministicFactCode(
        item.entityCode,
        item.attribute,
        seqIdx + 1,
      );

      // Referential & secondary-source epistemic checks
      if (entities.length > 0 && !knownEntityCodes.has(item.entityCode)) {
        issues.push({
          path: `facts.json[${item.originalIndex}].entity_code`,
          message: `Unknown entity_code "${item.entityCode}" referenced by fact "${code}" (not found in entities.csv).`,
        });
      }

      const resolvedSources: EvidenceSeed[] = [];
      let hasMissingOrInvalidEvidence = false;
      for (let evIdx = 0; evIdx < item.evidenceCodes.length; evIdx++) {
        const evCode = item.evidenceCodes[evIdx];
        if (!evCode) {
          continue;
        }
        const evRecord = evidenceByCode.get(evCode);
        if (!evRecord) {
          hasMissingOrInvalidEvidence = true;
          if (evidence.length > 0) {
            issues.push({
              path: `facts.json[${item.originalIndex}].evidence_ref.${evIdx}`,
              message: `Unknown evidence_ref "${evCode}" referenced by fact "${code}" (not found in evidence.json).`,
            });
          }
        } else {
          resolvedSources.push(evRecord);
        }
      }

      if (
        item.verificationState === "verified" &&
        !hasMissingOrInvalidEvidence &&
        resolvedSources.length > 0 &&
        !canVerifyFactWithSources(resolvedSources.map((s) => s.source_type))
      ) {
        secondaryOnlyVerifiedFacts.push({
          index: item.originalIndex,
          factCode: code,
          entityCode: item.entityCode,
          attribute: item.attribute,
          evidenceCodes: item.evidenceCodes,
        });
        issues.push({
          path: `facts.json[${item.originalIndex}].verification_state`,
          message: `Fact "${code}" (${item.entityCode} · ${item.attribute}) cannot have verification_state "verified" when backed solely by secondary evidence (${item.evidenceCodes.join(", ")}). At least one non-secondary source is required.`,
        });
      }

      const parsedFact = factSeedSchema.safeParse({
        code,
        entity_code: item.entityCode,
        attribute: item.attribute,
        value: item.value,
        unit: item.unit,
        valid_as_of: item.validAsOf,
        valid_as_of_precision: item.validAsOfPrecision,
        verification_state: item.verificationState,
        evidence_codes: item.evidenceCodes,
        notes: item.notes,
      });

      if (!parsedFact.success) {
        for (const zIssue of parsedFact.error.issues) {
          issues.push({
            path: `facts.json[${item.originalIndex}].${zIssue.path.join(".")}`,
            message: zIssue.message,
          });
        }
        continue;
      }

      if (parsedFact.data.valid_as_of === null) {
        precisions.null++;
      } else {
        precisions[parsedFact.data.valid_as_of_precision]++;
      }
      adaptedFacts.push(parsedFact.data);
    }
  }

  return {
    facts: adaptedFacts,
    factDatePrecisions: precisions,
    secondaryOnlyVerifiedFacts,
  };
}

/**
 * Pure, deterministic converter from research seed format (`entities.csv`, `evidence.json`, `facts.json`
 * or `*_rev2`) into canonical `scripts/import-seed.ts` format + structured validation report.
 */
export function adaptResearchSeedSources(
  sources: RawResearchSeedSources,
): ResearchSeedAdaptationResult {
  const issues: ValidationIssueDetail[] = [];
  const selectedRevision = sources.selectedRevision ?? "custom";

  const {
    entities,
    detectedAliasSeparator,
    missingStatusDefaultedToUnknown,
  } = adaptResearchEntitiesCsv(sources.entitiesCsv, issues);

  const {
    evidence,
    missingSourceTypeEvidenceRefs,
    evidencePublishedDatePrecisions,
  } = adaptResearchEvidenceJson(sources.evidenceJsonText, issues);

  const {
    facts,
    factDatePrecisions,
    secondaryOnlyVerifiedFacts,
  } = adaptResearchFactsJson(
    sources.factsJsonText,
    entities,
    evidence,
    issues,
  );

  const factEvidenceLinks = facts.reduce(
    (sum, fact) => sum + fact.evidence_codes.length,
    0,
  );
  const entitiesWithAliases = entities.filter(
    (e) => e.aliases.length > 0,
  ).length;
  const evidenceMissingUrl = evidence.filter((ev) => ev.url === null).length;

  if (issues.length > 0) {
    return {
      ok: false,
      bundle: null,
      serialized: null,
      report: {
        ok: false,
        selectedRevision,
        detectedAliasSeparator,
        counts: {
          entities: entities.length,
          entitiesWithAliases,
          missingStatusDefaultedToUnknown,
          evidence: evidence.length,
          evidenceMissingUrl,
          facts: facts.length,
          factEvidenceLinks,
          factDatePrecisions,
          evidencePublishedDatePrecisions,
        },
        missingSourceTypeEvidenceRefs,
        secondaryOnlyVerifiedFacts,
        bundleReport: null,
        issues,
      },
    };
  }

  const canonicalEntitiesCsv = serializeEntitiesCsv(entities);
  const canonicalEvidenceJsonText = `${JSON.stringify(evidence, null, 2)}\n`;
  const canonicalFactsJsonText = `${JSON.stringify(facts, null, 2)}\n`;

  // Final holistic round-trip verification through canonical validateSeedSources()
  const validatedBundle = validateSeedSources({
    entitiesCsv: canonicalEntitiesCsv,
    evidenceJsonText: canonicalEvidenceJsonText,
    factsJsonText: canonicalFactsJsonText,
  });

  const bundleReport = summarizeValidatedSeedBundle(validatedBundle);

  return {
    ok: true,
    bundle: validatedBundle,
    serialized: {
      entitiesCsv: canonicalEntitiesCsv,
      evidenceJsonText: canonicalEvidenceJsonText,
      factsJsonText: canonicalFactsJsonText,
    },
    report: {
      ok: true,
      selectedRevision,
      detectedAliasSeparator,
      counts: {
        entities: validatedBundle.entities.length,
        entitiesWithAliases,
        missingStatusDefaultedToUnknown,
        evidence: validatedBundle.evidence.length,
        evidenceMissingUrl,
        facts: validatedBundle.facts.length,
        factEvidenceLinks,
        factDatePrecisions,
        evidencePublishedDatePrecisions,
      },
      missingSourceTypeEvidenceRefs: [],
      secondaryOnlyVerifiedFacts: [],
      bundleReport,
      issues: [],
    },
  };
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveHighestRevisionFile(
  baseDir: string,
  stem: "entities" | "evidence" | "facts",
  ext: "csv" | "json",
  maxRev: number,
): Promise<string> {
  for (let rev = maxRev; rev >= 2; rev--) {
    const candidate = path.join(baseDir, `${stem}_rev${rev}.${ext}`);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return path.join(baseDir, `${stem}.${ext}`);
}

/**
 * Resolves input research files in `inputDir` (preferring the highest revision across
 * `entities_rev*.csv`, `evidence_rev*.json`, and `facts_rev*.json`, falling back per-file
 * to the highest available revision <= target revision — e.g. `entities_rev2.csv` +
 * `evidence_rev3.json` + `facts_rev3.json` when entities had no rev3 change).
 */
export async function resolveResearchSeedFiles(options: {
  inputDir?: string;
  revision?: number;
  entitiesPath?: string;
  evidencePath?: string;
  factsPath?: string;
}): Promise<ResolvedResearchInputFiles> {
  if (options.entitiesPath && options.evidencePath && options.factsPath) {
    return {
      selectedRevision:
        options.revision !== undefined ? `rev${options.revision}` : "explicit",
      entitiesPath: path.resolve(options.entitiesPath),
      evidencePath: path.resolve(options.evidencePath),
      factsPath: path.resolve(options.factsPath),
    };
  }

  if (!options.inputDir) {
    throw new Error(
      "Either --in <dir> or all three explicit paths (--entities, --evidence, --facts) must be provided.",
    );
  }

  const baseDir = path.resolve(options.inputDir);

  if (options.revision !== undefined) {
    if (options.revision === 1) {
      return {
        selectedRevision: "rev1",
        entitiesPath: options.entitiesPath
          ? path.resolve(options.entitiesPath)
          : path.join(baseDir, "entities.csv"),
        evidencePath: options.evidencePath
          ? path.resolve(options.evidencePath)
          : path.join(baseDir, "evidence.json"),
        factsPath: options.factsPath
          ? path.resolve(options.factsPath)
          : path.join(baseDir, "facts.json"),
      };
    }

    const [entitiesPath, evidencePath, factsPath] = await Promise.all([
      options.entitiesPath
        ? Promise.resolve(path.resolve(options.entitiesPath))
        : resolveHighestRevisionFile(baseDir, "entities", "csv", options.revision),
      options.evidencePath
        ? Promise.resolve(path.resolve(options.evidencePath))
        : resolveHighestRevisionFile(baseDir, "evidence", "json", options.revision),
      options.factsPath
        ? Promise.resolve(path.resolve(options.factsPath))
        : resolveHighestRevisionFile(baseDir, "facts", "json", options.revision),
    ]);

    return {
      selectedRevision: `rev${options.revision}`,
      entitiesPath,
      evidencePath,
      factsPath,
    };
  }

  // Auto-detect highest revision number across entities_rev*, evidence_rev*, facts_rev*
  let entries: string[] = [];
  try {
    entries = await readdir(baseDir);
  } catch (error) {
    throw new SeedValidationError(
      `Cannot read research seed directory "${baseDir}": ${error instanceof Error ? error.message : String(error)}`,
      [
        {
          path: baseDir,
          message: "Input directory does not exist or is unreadable.",
        },
      ],
    );
  }

  let highestRev = 1;
  for (const name of entries) {
    const match = /^(?:entities|evidence|facts)_rev(\d+)\.(?:csv|json)$/.exec(
      name,
    );
    if (match?.[1]) {
      const num = Number(match[1]);
      if (num > highestRev) {
        highestRev = num;
      }
    }
  }

  if (highestRev >= 2) {
    const [entitiesPath, evidencePath, factsPath] = await Promise.all([
      options.entitiesPath
        ? Promise.resolve(path.resolve(options.entitiesPath))
        : resolveHighestRevisionFile(baseDir, "entities", "csv", highestRev),
      options.evidencePath
        ? Promise.resolve(path.resolve(options.evidencePath))
        : resolveHighestRevisionFile(baseDir, "evidence", "json", highestRev),
      options.factsPath
        ? Promise.resolve(path.resolve(options.factsPath))
        : resolveHighestRevisionFile(baseDir, "facts", "json", highestRev),
    ]);

    return {
      selectedRevision: `rev${highestRev}`,
      entitiesPath,
      evidencePath,
      factsPath,
    };
  }

  return {
    selectedRevision: "rev1",
    entitiesPath: options.entitiesPath
      ? path.resolve(options.entitiesPath)
      : path.join(baseDir, "entities.csv"),
    evidencePath: options.evidencePath
      ? path.resolve(options.evidencePath)
      : path.join(baseDir, "evidence.json"),
    factsPath: options.factsPath
      ? path.resolve(options.factsPath)
      : path.join(baseDir, "facts.json"),
  };
}

/**
 * Reads research seed files from disk, runs deterministic adaptation + full validation,
 * and writes canonical files to `outDir` (`data/seed/` by default) ONLY when validation succeeds
 * and `dryRun` is false.
 */
export async function runAdaptResearchSeed(
  options: RunAdaptResearchSeedOptions,
): Promise<ResearchSeedAdaptationResult & { outDir: string; wroteFiles: boolean }> {
  const resolved = await resolveResearchSeedFiles(options);
  const outDir = path.resolve(options.outDir ?? path.resolve(process.cwd(), "data/seed"));
  const dryRun = options.dryRun ?? false;

  const readIssues: ValidationIssueDetail[] = [];
  const safeRead = async (filePath: string, label: string): Promise<string | null> => {
    try {
      return await readFile(filePath, "utf8");
    } catch (error) {
      readIssues.push({
        path: label,
        message: `Cannot read "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
      });
      return null;
    }
  };

  const [entitiesCsv, evidenceJsonText, factsJsonText] = await Promise.all([
    safeRead(resolved.entitiesPath, "entities.csv"),
    safeRead(resolved.evidencePath, "evidence.json"),
    safeRead(resolved.factsPath, "facts.json"),
  ]);

  if (
    readIssues.length > 0 ||
    entitiesCsv === null ||
    evidenceJsonText === null ||
    factsJsonText === null
  ) {
    throw new SeedValidationError(
      `Missing or unreadable research seed input file(s):\n` +
        readIssues.map((i) => `  - [${i.path}] ${i.message}`).join("\n"),
      readIssues,
    );
  }

  const result = adaptResearchSeedSources({
    entitiesCsv,
    evidenceJsonText,
    factsJsonText,
    selectedRevision: resolved.selectedRevision,
  });

  if (options.reportPath) {
    const absReportPath = path.resolve(options.reportPath);
    await mkdir(path.dirname(absReportPath), { recursive: true });
    await writeFile(
      absReportPath,
      `${JSON.stringify(result.report, null, 2)}\n`,
      "utf8",
    );
  }

  if (!result.ok || !result.serialized || dryRun) {
    return {
      ...result,
      outDir,
      wroteFiles: false,
    };
  }

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(outDir, "entities.csv"),
      result.serialized.entitiesCsv,
      "utf8",
    ),
    writeFile(
      path.join(outDir, "evidence.json"),
      result.serialized.evidenceJsonText,
      "utf8",
    ),
    writeFile(
      path.join(outDir, "facts.json"),
      result.serialized.factsJsonText,
      "utf8",
    ),
  ]);

  return {
    ...result,
    outDir,
    wroteFiles: true,
  };
}
