import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canVerifyFactWithSources,
  ENTITY_STATUSES,
  entitySeedSchema,
  evidenceSeedSchema,
  factSeedSchema,
  featureSeedSchema,
  isOperationalStatus,
} from "@/lib/atlas/schema";
import {
  loadAndValidateSeedDir,
  upsertValidatedSeedBundle,
  validateSeedSources,
  type SeedDbSession,
} from "@/lib/atlas/seed";
import { SeedValidationError } from "@/lib/errors";

describe("Atlas Zod schemas, researcher taxonomy, secondary evidence guard, and seed upsert", () => {
  it("enforces planned-never-operational status invariant", () => {
    expect(isOperationalStatus("operational")).toBe(true);
    for (const status of ENTITY_STATUSES) {
      if (status !== "operational") {
        expect(isOperationalStatus(status)).toBe(false);
      }
    }
  });

  it("accepts all 15 researcher entity_type values plus retained Phase 02 compatibility types", () => {
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
        sector: "EAST",
        status: "unknown",
      });
      expect(parsed.success, `Expected entity_type "${entityType}" to be valid`).toBe(
        true,
      );
    }
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

  it("loads and validates the hand-written TEST-* fixture (<= 5 entities, conflicting facts side by side)", async () => {
    const fixtureDir = path.resolve(
      process.cwd(),
      "tests/fixtures/seed-valid",
    );
    const bundle = await loadAndValidateSeedDir(fixtureDir);

    expect(bundle.entities.length).toBe(5);
    expect(bundle.entities.length).toBeLessThanOrEqual(5);

    for (const entity of bundle.entities) {
      expect(entity.code.startsWith("TEST-")).toBe(true);
    }

    const alphaLengthFacts = bundle.facts.filter(
      (f) => f.entity_code === "TEST-ROAD-ALPHA" && f.attribute === "length_km",
    );
    expect(alphaLengthFacts).toHaveLength(2);
    expect(alphaLengthFacts.map((f) => f.value).sort()).toEqual(["18.0", "19.4"]);
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

  it("upserts idempotently by code and reconciles fact_evidence links without duplicating rows", async () => {
    const fixtureDir = path.resolve(
      process.cwd(),
      "tests/fixtures/seed-valid",
    );
    const bundle = await loadAndValidateSeedDir(fixtureDir);

    let uuidSeq = 1;
    const nextUuid = () =>
      `00000000-0000-4000-8000-${String(uuidSeq++).padStart(12, "0")}`;

    const entitiesStore = new Map<
      string,
      { id: string; status: string; description: unknown }
    >();
    const evidenceStore = new Map<string, { id: string; url: string }>();
    const factsStore = new Map<
      string,
      { id: string; entityId: string; attribute: string; value: string }
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
          });
          return { rows: [{ id, code }] as unknown as Row[] };
        }

        if (sql.startsWith("INSERT INTO evidence") && values) {
          const code = String(values[0]);
          const existing = evidenceStore.get(code);
          const id = existing?.id ?? nextUuid();
          evidenceStore.set(code, { id, url: String(values[2]) });
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
    });
    expect(entitiesStore.size).toBe(5);
    expect(evidenceStore.size).toBe(4);
    expect(factsStore.size).toBe(5);
    expect(factEvidenceStore.size).toBe(7);

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
