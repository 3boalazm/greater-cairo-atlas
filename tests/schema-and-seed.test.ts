import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canVerifyFactWithSources,
  ENTITY_SECTORS,
  ENTITY_STATUSES,
  entitySeedSchema,
  evidenceSeedSchema,
  factSeedSchema,
  featureSeedSchema,
  isOperationalStatus,
  parsePartialIsoDate,
} from "@/lib/atlas/schema";
import {
  loadAndValidateSeedDir,
  serializeEntitiesCsv,
  summarizeValidatedSeedBundle,
  upsertValidatedSeedBundle,
  validateSeedSources,
  type SeedDbSession,
} from "@/lib/atlas/seed";
import { SeedValidationError } from "@/lib/errors";

describe("Atlas Zod schemas, Phase 03 taxonomy/precision/aliases extensions, and seed upsert", () => {
  it("enforces planned-never-operational status invariant", () => {
    expect(isOperationalStatus("operational")).toBe(true);
    for (const status of ENTITY_STATUSES) {
      if (status !== "operational") {
        expect(isOperationalStatus(status)).toBe(false);
      }
    }
  });

  it("accepts all 17 researcher entity_type values (including airport & rail_station), REGIONAL sector, and aliases", () => {
    expect(ENTITY_SECTORS).toContain("REGIONAL");

    const allExpectedEntityTypes = [
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
      // Compatibility values from 001
      "transit_station",
      "bridge_interchange",
      "public_facility",
      "development_zone",
    ];

    for (const entityType of allExpectedEntityTypes) {
      const parsed = entitySeedSchema.safeParse({
        code: "TEST-ENTITY-01",
        name_ar: "عنصر اختباري",
        name_en: "Synthetic Test Entity",
        entity_type: entityType,
        sector: "REGIONAL",
        status: "unknown",
        aliases: ["اسم بديل 1", "Alt Name 2"],
      });
      expect(parsed.success, `Expected entity_type "${entityType}" to be valid`).toBe(
        true,
      );
    }
  });

  it("parses partial ISO dates without inventing day precision and rejects invalid partial dates", () => {
    expect(parsePartialIsoDate("2024-10-12")).toEqual({
      date: "2024-10-12",
      precision: "day",
    });
    expect(parsePartialIsoDate("2026-02")).toEqual({
      date: "2026-02-01",
      precision: "month",
    });
    expect(parsePartialIsoDate("2024-10")).toEqual({
      date: "2024-10-01",
      precision: "month",
    });
    expect(parsePartialIsoDate("2025")).toEqual({
      date: "2025-01-01",
      precision: "year",
    });

    expect(parsePartialIsoDate("2026-13")).toBeNull();
    expect(parsePartialIsoDate("2026-00")).toBeNull();
    expect(parsePartialIsoDate("2026-02-30")).toBeNull();
    expect(parsePartialIsoDate("2026-Q1")).toBeNull();
    expect(parsePartialIsoDate("0999")).toBeNull();
    expect(parsePartialIsoDate("")).toBeNull();
  });

  it("requires non-empty title when evidence.url is null", () => {
    const documentedOfflineEvidence = evidenceSeedSchema.safeParse({
      code: "TEST-EVID-OFFLINE",
      title: "Official Cabinet Release #42",
      url: null,
      publisher: "Synthetic Official Publisher",
      source_type: "official",
      published_date: "2026-08-01",
      published_date_precision: "month",
      accessed_date: "2026-11-13",
    });
    expect(documentedOfflineEvidence.success).toBe(true);

    const anonymousMissingUrl = evidenceSeedSchema.safeParse({
      code: "TEST-EVID-ANONYMOUS",
      title: null,
      url: null,
      publisher: "Synthetic Official Publisher",
      source_type: "official",
      accessed_date: "2026-11-13",
    });
    expect(anonymousMissingUrl.success).toBe(false);
  });

  it("enforces secondary source_type epistemic rules", () => {
    expect(canVerifyFactWithSources([])).toBe(false);
    expect(canVerifyFactWithSources(["secondary"])).toBe(false);
    expect(canVerifyFactWithSources(["secondary", "secondary"])).toBe(false);
    expect(canVerifyFactWithSources(["secondary", "official"])).toBe(true);
    expect(canVerifyFactWithSources(["dataset"])).toBe(true);

    // Seed bundle where a 'verified' fact cites ONLY 'secondary' evidence must fail
    const entitiesCsv = [
      "code,name_ar,name_en,entity_type,sector,status,description",
      "TEST-PROJECT-01,مشروع اختباري,Synthetic Project,project,EAST,planned,",
    ].join("\n");

    const evidenceJson = JSON.stringify([
      {
        code: "TEST-EVID-WIKI",
        url: "https://example.org/wiki/synthetic",
        publisher: "Synthetic Wiki",
        source_type: "secondary",
        accessed_date: "2026-05-01",
      },
    ]);

    const illegalVerifiedFactsJson = JSON.stringify([
      {
        code: "TEST-FACT-ILLEGAL-VERIFIED",
        entity_code: "TEST-PROJECT-01",
        attribute: "area_feddan",
        value: "500",
        verification_state: "verified",
        evidence_codes: ["TEST-EVID-WIKI"],
      },
    ]);

    expect(() =>
      validateSeedSources({
        entitiesCsv,
        evidenceJsonText: evidenceJson,
        factsJsonText: illegalVerifiedFactsJson,
      }),
    ).toThrow(/solely by secondary evidence/);
  });

  it("validates table Zod schemas and rejects unknown enums, invalid dates, and partial OSM lineage", () => {
    expect(
      entitySeedSchema.safeParse({
        code: "TEST-ROAD-01",
        name_ar: "طريق اختباري",
        name_en: "Test Road",
        entity_type: "road",
        sector: "NORTHEAST",
        status: "operational",
      }).success,
    ).toBe(false);

    expect(
      evidenceSeedSchema.safeParse({
        code: "TEST-EVID-01",
        url: "https://example.org/source",
        publisher: "Test Publisher",
        source_type: "rumor",
        published_date: "2026-02-30",
        accessed_date: "2026-03-01",
      }).success,
    ).toBe(false);

    expect(
      factSeedSchema.safeParse({
        code: "TEST-FACT-01",
        entity_code: "TEST-ROAD-01",
        attribute: "length_km",
        value: "12.5",
        verification_state: "rumored",
        evidence_codes: [],
      }).success,
    ).toBe(false);

    expect(
      featureSeedSchema.safeParse({
        code: "TEST-FEAT-01",
        entity_code: "TEST-ROAD-01",
        geometry: {
          type: "Point",
          coordinates: [31.2357, 30.0444],
        },
        osm_type: "node",
        osm_id: 123456,
        license: "ODbL",
      }).success,
    ).toBe(false);

    expect(
      featureSeedSchema.safeParse({
        code: "TEST-FEAT-01",
        entity_code: "TEST-ROAD-01",
        geometry: {
          type: "Point",
          coordinates: [31.2357, 30.0444],
        },
        osm_type: "way",
        osm_id: 987654,
        osm_version: 4,
        license: "CC0-1.0",
      }).success,
    ).toBe(false);

    const validFeature = featureSeedSchema.safeParse({
      code: "TEST-FEAT-01",
      entity_code: "TEST-ROAD-01",
      geometry: {
        type: "LineString",
        coordinates: [
          [31.2, 30.0],
          [31.3, 30.1],
        ],
      },
      osm_type: "way",
      osm_id: 987654,
      osm_version: 4,
      license: "ODbL",
    });
    expect(validFeature.success).toBe(true);
  });

  it("round-trips canonical entities.csv with pipe-delimited Arabic aliases", () => {
    const csv = serializeEntitiesCsv([
      {
        code: "TEST-AIRPORT-01",
        name_ar: "مطار اختباري",
        name_en: "Synthetic Airport",
        entity_type: "airport",
        sector: "REGIONAL",
        status: "unknown",
        aliases: ["مطار تجريبي", "Test Hub"],
        description: null,
      },
    ]);

    const validated = validateSeedSources({
      entitiesCsv: csv,
      evidenceJsonText: "[]",
      factsJsonText: "[]",
    });
    expect(validated.entities).toHaveLength(1);
    expect(validated.entities[0]?.aliases).toEqual([
      "مطار تجريبي",
      "Test Hub",
    ]);
  });

  it("loads and validates both the synthetic TEST-* fixture and the canonical data/seed bundle", async () => {
    const fixtureDir = path.resolve(
      process.cwd(),
      "tests/fixtures/seed-valid",
    );
    const bundle = await loadAndValidateSeedDir(fixtureDir);

    expect(bundle.entities.length).toBe(5);
    for (const entity of bundle.entities) {
      expect(entity.code.startsWith("TEST-")).toBe(true);
      expect(entity.aliases).toEqual([]);
    }

    const alphaLengthFacts = bundle.facts.filter(
      (f) => f.entity_code === "TEST-ROAD-ALPHA" && f.attribute === "length_km",
    );
    expect(alphaLengthFacts).toHaveLength(2);
    expect(alphaLengthFacts.map((f) => f.value).sort()).toEqual(["18.0", "19.4"]);

    // Verify canonical data/seed/ bundle passes full holistic validation
    const canonicalBundle = await loadAndValidateSeedDir();
    expect(canonicalBundle.entities.length).toBe(342);
    expect(canonicalBundle.evidence.length).toBe(324);
    expect(canonicalBundle.facts.length).toBe(1348);
    const canonicalReport = summarizeValidatedSeedBundle(canonicalBundle);
    expect(canonicalReport.factEvidenceLinksCount).toBe(1460);
    expect(canonicalReport.evidenceMissingUrlCount).toBe(74);
    expect(canonicalReport.unresolvedOfficialEvidenceCodes).toEqual([
      "EV-045",
      "EV-046",
    ]);
    expect(canonicalReport.warnings).toHaveLength(74);
    const evidenceByCode = new Map(
      canonicalBundle.evidence.map((evidence) => [evidence.code, evidence]),
    );
    const verifiedFacts = canonicalBundle.facts.filter(
      (candidate) => candidate.verification_state === "verified",
    );
    expect(verifiedFacts).toHaveLength(331);
    for (const fact of verifiedFacts) {
      expect(
        fact.evidence_codes.some((code) => {
          const evidence = evidenceByCode.get(code);
          return evidence?.source_type === "official" && evidence.url !== null;
        }),
        `verified fact ${fact.code} must cite an official source with a URL`,
      ).toBe(true);
    }
  });

  it("reports ALL validation errors across entities.csv, evidence.json, and facts.json at once", () => {
    const brokenEntitiesCsv = [
      "code,name_ar,name_en,entity_type,sector,status,description",
      "bad_lowercase_code,اسم,Bad Code,road,EAST,operational,",
      "TEST-BAD-ENUM,اسم,Bad Enum,spaceship,INVALID_SECTOR,active_now,",
    ].join("\n");

    const brokenEvidenceJson = JSON.stringify([
      {
        code: "TEST-EVID-BAD",
        url: "ftp://not-http.example.org",
        publisher: "Synthetic",
        source_type: "rumor",
        accessed_date: "2026-99-99",
      },
    ]);

    const brokenFactsJson = JSON.stringify([
      {
        code: "TEST-FACT-ORPHAN",
        entity_code: "TEST-UNKNOWN-ENTITY",
        attribute: "length_km",
        value: "10",
        verification_state: "single_source",
        evidence_codes: ["TEST-UNKNOWN-EVIDENCE"],
      },
      {
        code: "TEST-FACT-BAD-STATE",
        entity_code: "TEST-UNKNOWN-ENTITY",
        attribute: "InvalidCamelCase",
        value: "10",
        verification_state: "certain",
        evidence_codes: [],
      },
    ]);

    let caught: SeedValidationError | undefined;
    try {
      validateSeedSources({
        entitiesCsv: brokenEntitiesCsv,
        evidenceJsonText: brokenEvidenceJson,
        factsJsonText: brokenFactsJson,
      });
    } catch (error) {
      if (error instanceof SeedValidationError) {
        caught = error;
      } else {
        throw error;
      }
    }

    expect(caught).toBeDefined();
    const paths = (caught?.issues ?? []).map((i) => i.path);

    expect(paths.some((p) => p.startsWith("entities.csv:line 2"))).toBe(true);
    expect(paths.some((p) => p.startsWith("entities.csv:line 3"))).toBe(true);
    expect(paths.some((p) => p.startsWith("evidence.json[0]"))).toBe(true);
    expect(paths).toContain("facts.json[0].entity_code");
    expect(paths).toContain("facts.json[0].evidence_codes.0");
    expect(paths.some((p) => p.startsWith("facts.json[1]"))).toBe(true);
  });

  it("upserts idempotently by code (including aliases and date precisions) without duplicating rows", async () => {
    const fixtureDir = path.resolve(
      process.cwd(),
      "tests/fixtures/seed-valid",
    );
    const bundle = await loadAndValidateSeedDir(fixtureDir);
    if (bundle.entities[0]) {
      bundle.entities[0].aliases = ["طريق ألفا", "Alpha Axis"];
    }
    if (bundle.facts[0]) {
      bundle.facts[0].valid_as_of = "2026-02-01";
      bundle.facts[0].valid_as_of_precision = "month";
    }

    let uuidSeq = 1;
    const nextUuid = () =>
      `00000000-0000-4000-8000-${String(uuidSeq++).padStart(12, "0")}`;

    const entitiesStore = new Map<
      string,
      { id: string; status: string; description: unknown; aliases: unknown }
    >();
    const evidenceStore = new Map<string, { id: string; url: unknown }>();
    const factsStore = new Map<
      string,
      {
        id: string;
        entityId: string;
        attribute: string;
        value: string;
        precision: string;
      }
    >();
    const factEvidenceStore = new Set<string>();

    const createStatefulSession = (): SeedDbSession => ({
      async connect() {},
      async query<Row = Record<string, unknown>>(
        text: string,
        values?: unknown[],
      ) {
        const sql = text.trim();
        if (sql.startsWith("INSERT INTO entities") && values) {
          const code = String(values[0]);
          const existing = entitiesStore.get(code);
          const id = existing?.id ?? nextUuid();
          entitiesStore.set(code, {
            id,
            status: String(values[5]),
            description: values[6],
            aliases: values[7],
          });
          return { rows: [{ id, code }] as unknown as Row[] };
        }

        if (sql.startsWith("INSERT INTO evidence") && values) {
          const code = String(values[0]);
          const existing = evidenceStore.get(code);
          const id = existing?.id ?? nextUuid();
          evidenceStore.set(code, { id, url: values[2] });
          return { rows: [{ id, code }] as unknown as Row[] };
        }

        if (sql.startsWith("INSERT INTO facts") && values) {
          const code = String(values[0]);
          const existing = factsStore.get(code);
          const id = existing?.id ?? nextUuid();
          factsStore.set(code, {
            id,
            entityId: String(values[1]),
            attribute: String(values[2]),
            value: String(values[3]),
            precision: String(values[8]),
          });
          return { rows: [{ id, code }] as unknown as Row[] };
        }

        if (sql.startsWith("DELETE FROM fact_evidence") && values) {
          const factId = String(values[0]);
          const keepIds = new Set((values[1] as string[]) ?? []);
          for (const key of Array.from(factEvidenceStore)) {
            const [fId, eId] = key.split(":");
            if (fId === factId && eId && !keepIds.has(eId)) {
              factEvidenceStore.delete(key);
            }
          }
          return { rows: [] };
        }

        if (sql.startsWith("INSERT INTO fact_evidence") && values) {
          const key = `${String(values[0])}:${String(values[1])}`;
          factEvidenceStore.add(key);
          return { rows: [] };
        }

        return { rows: [] };
      },
      async end() {},
    });

    const firstRun = await upsertValidatedSeedBundle(
      bundle,
      createStatefulSession,
    );
    expect(firstRun).toEqual({
      entitiesCount: 5,
      evidenceCount: 4,
      factsCount: 5,
      factEvidenceLinksCount: 7,
      featuresCount: 0,
      importSync: {
        featuresDeletedCount: 0,
        factEvidenceLinksDeletedCount: 0,
        entitiesNotInSeedCount: 0,
        factsNotInSeedCount: 0,
        evidenceNotInSeedCount: 0,
        databasePreviewAvailable: true,
      },
    });
    expect(entitiesStore.get("TEST-ROAD-ALPHA")?.aliases).toEqual([
      "طريق ألفا",
      "Alpha Axis",
    ]);
    expect(factsStore.get("TEST-FACT-ALPHA-LEN-A")?.precision).toBe(
      "month",
    );

    const secondBundle = structuredClone(bundle);
    if (secondBundle.entities[0]) {
      secondBundle.entities[0].description = "Updated description on second run.";
    }
    if (secondBundle.facts[1]) {
      secondBundle.facts[1].evidence_codes = ["TEST-EVID-DATASET-02"];
    }

    const secondRun = await upsertValidatedSeedBundle(
      secondBundle,
      createStatefulSession,
    );
    expect(secondRun.entitiesCount).toBe(5);
    expect(secondRun.factsCount).toBe(5);
    expect(secondRun.factEvidenceLinksCount).toBe(6);

    expect(entitiesStore.size).toBe(5);
    expect(evidenceStore.size).toBe(4);
    expect(factsStore.size).toBe(5);
    expect(factEvidenceStore.size).toBe(6);
    expect(entitiesStore.get("TEST-ROAD-ALPHA")?.description).toBe(
      "Updated description on second run.",
    );
  });
});
