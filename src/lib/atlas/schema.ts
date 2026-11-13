import { z } from "zod";

export const ATLAS_CODE_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
export const FACT_ATTRIBUTE_PATTERN = /^[a-z][a-z0-9_]*$/;
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_YEAR_MONTH_PATTERN = /^\d{4}-\d{2}$/;
export const ISO_YEAR_PATTERN = /^\d{4}$/;

export const ENTITY_TYPES = [
  // Researcher taxonomy (17 canonical types)
  "city",
  "district",
  "neighborhood",
  "road",
  "bridge",
  "interchange",
  "tunnel",
  "transit_line",
  "transit_stop",
  "rail_station",
  "airport",
  "project",
  "authority",
  "landmark",
  "facility",
  "waterway",
  "utility",
  // Retained Phase 02 compatibility types
  "transit_station",
  "bridge_interchange",
  "public_facility",
  "development_zone",
] as const;

export const ENTITY_SECTORS = [
  "NORTH",
  "EAST",
  "SOUTH",
  "WEST",
  "CENTRAL",
  "REGIONAL",
] as const;

export const ENTITY_STATUSES = [
  "operational",
  "partial",
  "under_construction",
  "planned",
  "approved_planned",
  "unknown",
] as const;

export const FACT_VERIFICATION_STATES = [
  "candidate",
  "single_source",
  "corroborated",
  "verified",
  "disputed",
  "rejected",
  "superseded",
] as const;

export const EVIDENCE_SOURCE_TYPES = [
  "official",
  "news",
  "dataset",
  "map",
  "pdf",
  "secondary",
] as const;

export const DATE_PRECISIONS = ["day", "month", "year"] as const;

export const OSM_ELEMENT_TYPES = ["node", "way", "relation"] as const;

export const FEATURE_LICENSES = [
  "ODbL",
  "ODbL-1.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "official_gazette",
  "custom_documented",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];
export type EntitySector = (typeof ENTITY_SECTORS)[number];
export type EntityStatus = (typeof ENTITY_STATUSES)[number];
export type FactVerificationState = (typeof FACT_VERIFICATION_STATES)[number];
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];
export type DatePrecision = (typeof DATE_PRECISIONS)[number];
export type OsmElementType = (typeof OSM_ELEMENT_TYPES)[number];
export type FeatureLicense = (typeof FEATURE_LICENSES)[number];

/**
 * Planned, approved_planned, under_construction, partial, and unknown items
 * must never be treated as operational without an explicit status === 'operational'.
 */
export function isOperationalStatus(status: EntityStatus): boolean {
  return status === "operational";
}

/**
 * Weak 'secondary' sources (Wikipedia, real-estate blogs, aggregators) must never
 * by themselves qualify a fact as 'verified'. At least one non-secondary source is required.
 */
export function canVerifyFactWithSources(
  sourceTypes: readonly EvidenceSourceType[],
): boolean {
  return sourceTypes.some((sourceType) => sourceType !== "secondary");
}

function isRealCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (year < 1000) {
    return false;
  }

  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

export interface ParsedPartialIsoDate {
  date: string;
  precision: DatePrecision;
}

/**
 * Parses a full or partial ISO calendar date without inventing day/month precision:
 *   - "YYYY-MM-DD" -> { date: "YYYY-MM-DD", precision: "day" }
 *   - "YYYY-MM"    -> { date: "YYYY-MM-01", precision: "month" }
 *   - "YYYY"       -> { date: "YYYY-01-01", precision: "year" }
 * Returns null if the input is malformed or not a valid calendar year/month/day.
 */
export function parsePartialIsoDate(raw: string): ParsedPartialIsoDate | null {
  const trimmed = raw.trim();
  if (isRealCalendarDate(trimmed)) {
    return { date: trimmed, precision: "day" };
  }

  if (ISO_YEAR_MONTH_PATTERN.test(trimmed)) {
    const [yearPart, monthPart] = trimmed.split("-");
    const year = Number(yearPart);
    const month = Number(monthPart);
    if (year >= 1000 && month >= 1 && month <= 12) {
      return {
        date: `${yearPart}-${monthPart}-01`,
        precision: "month",
      };
    }
    return null;
  }

  if (ISO_YEAR_PATTERN.test(trimmed)) {
    const year = Number(trimmed);
    if (year >= 1000) {
      return {
        date: `${trimmed}-01-01`,
        precision: "year",
      };
    }
    return null;
  }

  return null;
}

function isHttpUrlWithoutWhitespace(value: string): boolean {
  if (/\s/.test(value)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}

export const atlasCodeSchema = z
  .string()
  .trim()
  .min(3, { error: "Code must be at least 3 characters." })
  .max(120, { error: "Code must be at most 120 characters." })
  .regex(ATLAS_CODE_PATTERN, {
    error:
      "Code must use uppercase alphanumeric segments separated by hyphens (e.g. ROAD-MIDDLE-RING).",
  });

export const nonEmptyTrimmedTextSchema = z
  .string()
  .trim()
  .min(1, { error: "Text value must not be empty." });

export const nullableOptionalTextSchema = z
  .string()
  .trim()
  .min(1, { error: "Optional text value must not be blank when provided." })
  .nullable()
  .optional()
  .transform((val) => val ?? null);

export const isoDateStringSchema = z
  .string()
  .trim()
  .refine(isRealCalendarDate, {
    error: "Date must be a valid calendar date in YYYY-MM-DD format.",
  });

export const nullableOptionalIsoDateSchema = isoDateStringSchema
  .nullable()
  .optional()
  .transform((val) => val ?? null);

export const httpUrlSchema = z
  .string()
  .trim()
  .refine(isHttpUrlWithoutWhitespace, {
    error: "URL must be a valid http:// or https:// URL without whitespace.",
  });

export const nullableOptionalHttpUrlSchema = httpUrlSchema
  .nullable()
  .optional()
  .transform((val) => val ?? null);

export const entityTypeSchema = z.enum(ENTITY_TYPES);
export const entitySectorSchema = z.enum(ENTITY_SECTORS);
export const entityStatusSchema = z.enum(ENTITY_STATUSES);
export const factVerificationStateSchema = z.enum(FACT_VERIFICATION_STATES);
export const evidenceSourceTypeSchema = z.enum(EVIDENCE_SOURCE_TYPES);
export const datePrecisionSchema = z.enum(DATE_PRECISIONS);
export const osmElementTypeSchema = z.enum(OSM_ELEMENT_TYPES);
export const featureLicenseSchema = z.enum(FEATURE_LICENSES);

export const factAttributeSchema = z
  .string()
  .trim()
  .min(2, { error: "Attribute must be at least 2 characters." })
  .max(100, { error: "Attribute must be at most 100 characters." })
  .regex(FACT_ATTRIBUTE_PATTERN, {
    error:
      "Attribute must be lowercase snake_case starting with a letter (e.g. length_km).",
  });

// ---------------------------------------------------------------------------
// WGS 84 (SRID 4326) GeoJSON Geometry schemas
// ---------------------------------------------------------------------------
export const wgs84PositionSchema = z
  .tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
  ])
  .or(
    z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
      z.number(),
    ]),
  );

const linearRingSchema = z
  .array(wgs84PositionSchema)
  .min(4, { error: "Polygon linear ring requires at least 4 positions." });

const nonCollectionGeometrySchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("Point"),
    coordinates: wgs84PositionSchema,
  }),
  z.strictObject({
    type: z.literal("MultiPoint"),
    coordinates: z.array(wgs84PositionSchema).min(1),
  }),
  z.strictObject({
    type: z.literal("LineString"),
    coordinates: z.array(wgs84PositionSchema).min(2),
  }),
  z.strictObject({
    type: z.literal("MultiLineString"),
    coordinates: z.array(z.array(wgs84PositionSchema).min(2)).min(1),
  }),
  z.strictObject({
    type: z.literal("Polygon"),
    coordinates: z.array(linearRingSchema).min(1),
  }),
  z.strictObject({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(linearRingSchema).min(1)).min(1),
  }),
]);

export const geoJsonGeometrySchema = z.union([
  nonCollectionGeometrySchema,
  z.strictObject({
    type: z.literal("GeometryCollection"),
    geometries: z.array(nonCollectionGeometrySchema).min(1),
  }),
]);

export type GeoJsonGeometry = z.infer<typeof geoJsonGeometrySchema>;

// ---------------------------------------------------------------------------
// Seed / Input Schemas (used by scripts/import-seed.ts & importers)
// ---------------------------------------------------------------------------
export const entitySeedSchema = z.strictObject({
  code: atlasCodeSchema,
  name_ar: nonEmptyTrimmedTextSchema,
  name_en: nonEmptyTrimmedTextSchema,
  entity_type: entityTypeSchema,
  sector: entitySectorSchema,
  status: entityStatusSchema,
  aliases: z.array(nonEmptyTrimmedTextSchema).default([]),
  description: nullableOptionalTextSchema,
});

export const evidenceSeedSchema = z
  .strictObject({
    code: atlasCodeSchema,
    title: nullableOptionalTextSchema,
    url: nullableOptionalHttpUrlSchema,
    publisher: nonEmptyTrimmedTextSchema,
    source_type: evidenceSourceTypeSchema,
    published_date: nullableOptionalIsoDateSchema,
    published_date_precision: datePrecisionSchema.default("day"),
    accessed_date: isoDateStringSchema,
    notes: nullableOptionalTextSchema,
  })
  .superRefine((evidence, ctx) => {
    if (evidence.url === null && evidence.title === null) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message:
          "Evidence record must provide either an http(s) url or a non-empty title.",
      });
    }
    if (
      evidence.published_date === null &&
      evidence.published_date_precision !== "day"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["published_date_precision"],
        message:
          "published_date_precision must be 'day' when published_date is null.",
      });
    }
  });

export const factSeedSchema = z
  .strictObject({
    code: atlasCodeSchema,
    entity_code: atlasCodeSchema,
    attribute: factAttributeSchema,
    value: nonEmptyTrimmedTextSchema,
    unit: nullableOptionalTextSchema,
    valid_as_of: nullableOptionalIsoDateSchema,
    valid_as_of_precision: datePrecisionSchema.default("day"),
    verification_state: factVerificationStateSchema,
    evidence_codes: z
      .array(atlasCodeSchema)
      .min(1, { error: "Every fact must cite at least one evidence_code." }),
    notes: nullableOptionalTextSchema,
  })
  .superRefine((fact, ctx) => {
    if (fact.valid_as_of === null && fact.valid_as_of_precision !== "day") {
      ctx.addIssue({
        code: "custom",
        path: ["valid_as_of_precision"],
        message:
          "valid_as_of_precision must be 'day' when valid_as_of is null.",
      });
    }

    const seen = new Set<string>();
    for (let idx = 0; idx < fact.evidence_codes.length; idx++) {
      const evCode = fact.evidence_codes[idx];
      if (!evCode) {
        continue;
      }
      if (seen.has(evCode)) {
        ctx.addIssue({
          code: "custom",
          path: ["evidence_codes", idx],
          message: `Duplicate evidence_code "${evCode}" within fact "${fact.code}".`,
        });
      }
      seen.add(evCode);
    }
  });

function validateOsmLineageAndLicense(
  input: {
    osm_type: OsmElementType | null;
    osm_id: number | null;
    osm_version: number | null;
    license: FeatureLicense;
  },
  ctx: z.RefinementCtx,
): void {
  const presentCount =
    Number(input.osm_type !== null) +
    Number(input.osm_id !== null) +
    Number(input.osm_version !== null);

  if (presentCount > 0 && presentCount < 3) {
    ctx.addIssue({
      code: "custom",
      path: ["osm_type"],
      message:
        "OSM lineage must be complete: osm_type, osm_id, and osm_version must either all be provided or all be null.",
    });
  }

  if (
    presentCount === 3 &&
    input.license !== "ODbL" &&
    input.license !== "ODbL-1.0"
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["license"],
      message:
        "Features with OpenStreetMap lineage must carry license 'ODbL' or 'ODbL-1.0'.",
    });
  }
}

export const featureSeedSchema = z
  .strictObject({
    code: atlasCodeSchema,
    entity_code: atlasCodeSchema,
    evidence_code: atlasCodeSchema
      .nullable()
      .optional()
      .transform((val) => val ?? null),
    geometry: geoJsonGeometrySchema,
    srid: z.literal(4326).default(4326),
    osm_type: osmElementTypeSchema
      .nullable()
      .optional()
      .transform((val) => val ?? null),
    osm_id: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional()
      .transform((val) => val ?? null),
    osm_version: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional()
      .transform((val) => val ?? null),
    license: featureLicenseSchema.default("ODbL"),
    properties: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine(validateOsmLineageAndLicense);

// ---------------------------------------------------------------------------
// Database Row Schemas (mirroring PostgreSQL columns)
// ---------------------------------------------------------------------------
const uuidSchema = z.uuid();
const timestampSchema = z.union([z.iso.datetime(), z.date()]);

export const entityRowSchema = z.strictObject({
  id: uuidSchema,
  code: atlasCodeSchema,
  name_ar: nonEmptyTrimmedTextSchema,
  name_en: nonEmptyTrimmedTextSchema,
  entity_type: entityTypeSchema,
  sector: entitySectorSchema,
  status: entityStatusSchema,
  aliases: z.array(nonEmptyTrimmedTextSchema),
  description: z.string().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const evidenceRowSchema = z.strictObject({
  id: uuidSchema,
  code: atlasCodeSchema,
  title: z.string().nullable(),
  url: httpUrlSchema.nullable(),
  publisher: nonEmptyTrimmedTextSchema,
  source_type: evidenceSourceTypeSchema,
  published_date: isoDateStringSchema.nullable(),
  published_date_precision: datePrecisionSchema,
  accessed_date: isoDateStringSchema,
  notes: z.string().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const factRowSchema = z.strictObject({
  id: uuidSchema,
  code: atlasCodeSchema,
  entity_id: uuidSchema,
  attribute: factAttributeSchema,
  value: nonEmptyTrimmedTextSchema,
  unit: z.string().nullable(),
  valid_as_of: isoDateStringSchema.nullable(),
  valid_as_of_precision: datePrecisionSchema,
  verification_state: factVerificationStateSchema,
  notes: z.string().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const factEvidenceRowSchema = z.strictObject({
  fact_id: uuidSchema,
  evidence_id: uuidSchema,
  created_at: timestampSchema,
});

export const featureRowSchema = z
  .strictObject({
    id: uuidSchema,
    code: atlasCodeSchema,
    entity_id: uuidSchema,
    evidence_id: uuidSchema.nullable(),
    geometry: geoJsonGeometrySchema,
    osm_type: osmElementTypeSchema.nullable(),
    osm_id: z.number().int().positive().nullable(),
    osm_version: z.number().int().positive().nullable(),
    license: featureLicenseSchema,
    properties: z.record(z.string(), z.unknown()),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .superRefine(validateOsmLineageAndLicense);

export type EntitySeed = z.infer<typeof entitySeedSchema>;
export type EvidenceSeed = z.infer<typeof evidenceSeedSchema>;
export type FactSeed = z.infer<typeof factSeedSchema>;
export type FeatureSeed = z.infer<typeof featureSeedSchema>;

export type EntityRow = z.infer<typeof entityRowSchema>;
export type EvidenceRow = z.infer<typeof evidenceRowSchema>;
export type FactRow = z.infer<typeof factRowSchema>;
export type FactEvidenceRow = z.infer<typeof factEvidenceRowSchema>;
export type FeatureRow = z.infer<typeof featureRowSchema>;
