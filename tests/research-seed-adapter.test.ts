import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  adaptResearchSeedSources,
  detectAliasSeparator,
  resolveResearchSeedFiles,
  runAdaptResearchSeed,
} from "@/lib/atlas/research-seed";

describe("Research seed adapter (scripts/adapt-research-seed.ts & src/lib/atlas/research-seed.ts)", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "gca-research-adapter-"));
    tempDirs.push(dir);
    return dir;
  }

  it("detects alias separators (pipe, semicolon, Arabic comma, ASCII comma, JSON, and single en-dash names)", () => {
    expect(detectAliasSeparator(["", "محور شبرا–بنها الحر"])).toBe("none");
    expect(detectAliasSeparator(["الزراعي|الإسكندرية الزراعي", "التسعين"])).toBe(
      "|",
    );
    expect(detectAliasSeparator(["Alt A; Alt B", "Single"])).toBe(";");
    expect(detectAliasSeparator(["بديل أ، بديل ب"])).toBe("،");
    expect(detectAliasSeparator(["Alpha, Beta"])).toBe(",");
    expect(detectAliasSeparator(['["Alpha","Beta"]'])).toBe("json");

    const semicolonEntitiesCsv = [
      "entity_code,entity_type,canonical_name_ar,canonical_name_en,aliases,sector_code,status,description",
      "TEST-RAIL-01,rail_station,محطة قطار اختبارية,Synthetic Rail Station,محطة أ; محطة ب; محطة أ,REGIONAL,operational,",
      "TEST-AIRPORT-01,airport,مطار اختباري,Synthetic Airport,محور أ–ب,EAST,planned,",
    ].join("\n");

    const adapted = adaptResearchSeedSources({
      entitiesCsv: semicolonEntitiesCsv,
      evidenceJsonText: "[]",
      factsJsonText: "[]",
    });

    expect(adapted.ok).toBe(true);
    expect(adapted.report.detectedAliasSeparator).toBe(";");
    expect(adapted.bundle?.entities[0]?.aliases).toEqual([
      "محطة أ",
      "محطة ب",
    ]);
    // En-dash inside single alias is preserved intact
    expect(adapted.bundle?.entities[1]?.aliases).toEqual(["محور أ–ب"]);
  });

  it("maps missing status column or blank status cells to 'unknown' (never 'operational')", () => {
    const rev1StyleCsvWithoutStatusCol = [
      "entity_code,entity_type,canonical_name_ar,canonical_name_en,aliases,sector_code",
      "TEST-ROAD-01,road,طريق اختباري,Test Road,,REGIONAL",
      "TEST-STOP-01,transit_stop,محطة اختبارية,Test Stop,بديل,WEST",
    ].join("\n");

    const res1 = adaptResearchSeedSources({
      entitiesCsv: rev1StyleCsvWithoutStatusCol,
      evidenceJsonText: "[]",
      factsJsonText: "[]",
    });
    expect(res1.ok).toBe(true);
    expect(res1.report.counts.missingStatusDefaultedToUnknown).toBe(2);
    expect(res1.bundle?.entities.map((e) => e.status)).toEqual([
      "unknown",
      "unknown",
    ]);

    const rev2BlankStatusCellCsv = [
      "entity_code,entity_type,canonical_name_ar,canonical_name_en,aliases,sector_code,status,description",
      "TEST-ROAD-01,road,طريق اختباري,Test Road,,EAST,,",
      "TEST-ROAD-02,road,طريق ٢,Test Road 2,,EAST,planned,",
    ].join("\n");

    const res2 = adaptResearchSeedSources({
      entitiesCsv: rev2BlankStatusCellCsv,
      evidenceJsonText: "[]",
      factsJsonText: "[]",
    });
    expect(res2.ok).toBe(true);
    expect(res2.report.counts.missingStatusDefaultedToUnknown).toBe(1);
    expect(res2.bundle?.entities.map((e) => e.status)).toEqual([
      "unknown",
      "planned",
    ]);
  });

  it("converts partial dates (YYYY-MM and YYYY) to first-of-period + valid_as_of_precision and rejects invalid dates", () => {
    const entitiesCsv = [
      "entity_code,entity_type,canonical_name_ar,canonical_name_en,aliases,sector_code,status,description",
      "TEST-AIRPORT-01,airport,مطار اختباري,Synthetic Airport,,EAST,operational,",
    ].join("\n");

    const evidenceJson = JSON.stringify([
      {
        evidence_ref: "TEST-EV-01",
        source_url: "https://example.gov.eg/airport",
        publisher: "Synthetic Ministry",
        title: "Official Airport Bulletin",
        note: null,
        source_type: "official",
        published_date: "2026-08",
        accessed_date: "2026-11-13",
      },
    ]);

    const factsJson = JSON.stringify([
      {
        entity_code: "TEST-AIRPORT-01",
        attribute_key: "opening_month",
        value: "2024-10",
        unit: null,
        status_as_of: "2024-10",
        verification_state: "verified",
        evidence_ref: "TEST-EV-01",
      },
      {
        entity_code: "TEST-AIRPORT-01",
        attribute_key: "annual_passengers_target",
        value: 1500000,
        unit: "visitors",
        status_as_of: "2025",
        verification_state: "candidate",
        evidence_ref: "TEST-EV-01",
      },
      {
        entity_code: "TEST-AIRPORT-01",
        attribute_key: "scheduled_service_active",
        value: false,
        unit: null,
        status_as_of: "2026-02-01",
        verification_state: "verified",
        evidence_ref: "TEST-EV-01",
      },
    ]);

    const res = adaptResearchSeedSources({
      entitiesCsv,
      evidenceJsonText: evidenceJson,
      factsJsonText: factsJson,
    });

    expect(res.ok).toBe(true);
    expect(res.bundle?.evidence[0]?.published_date).toBe("2026-08-01");
    expect(res.bundle?.evidence[0]?.published_date_precision).toBe("month");

    const byAttr = new Map(
      res.bundle?.facts.map((f) => [f.attribute, f]) ?? [],
    );
    expect(byAttr.get("opening_month")).toMatchObject({
      valid_as_of: "2024-10-01",
      valid_as_of_precision: "month",
    });
    expect(byAttr.get("annual_passengers_target")).toMatchObject({
      value: "1500000",
      valid_as_of: "2025-01-01",
      valid_as_of_precision: "year",
    });
    expect(byAttr.get("scheduled_service_active")).toMatchObject({
      value: "false",
      valid_as_of: "2026-02-01",
      valid_as_of_precision: "day",
    });
    expect(res.report.counts.factDatePrecisions).toEqual({
      day: 1,
      month: 1,
      year: 1,
      null: 0,
    });

    // Invalid partial date must be rejected, never guessed
    const badDateRes = adaptResearchSeedSources({
      entitiesCsv,
      evidenceJsonText: evidenceJson,
      factsJsonText: JSON.stringify([
        {
          entity_code: "TEST-AIRPORT-01",
          attribute_key: "target_opening",
          value: "2026-Q1",
          unit: null,
          status_as_of: "2026-Q1",
          verification_state: "candidate",
          evidence_ref: "TEST-EV-01",
        },
      ]),
    });
    expect(badDateRes.ok).toBe(false);
    expect(badDateRes.report.issues[0]?.path).toBe(
      "facts.json[0].status_as_of",
    );
  });

  it("fails with an explicit missingSourceTypeEvidenceRefs list when source_type is absent (rev1)", async () => {
    const inDir = await makeTempDir();
    const outDir = path.join(await makeTempDir(), "seed-out");

    await writeFile(
      path.join(inDir, "entities.csv"),
      [
        "entity_code,entity_type,canonical_name_ar,canonical_name_en,aliases,sector_code",
        "TEST-ROAD-01,road,طريق اختباري,Test Road,,EAST",
      ].join("\n"),
    );
    await writeFile(
      path.join(inDir, "evidence.json"),
      JSON.stringify([
        {
          evidence_ref: "TEST-EV-01",
          source_url: "https://example.org/1",
          publisher: "Publisher A",
          title: "Title A",
          note: null,
        },
        {
          evidence_ref: "TEST-EV-02",
          source_url: "https://example.org/2",
          publisher: "Publisher B",
          title: "Title B",
          note: null,
        },
      ]),
    );
    await writeFile(path.join(inDir, "facts.json"), "[]");

    const outcome = await runAdaptResearchSeed({
      inputDir: inDir,
      outDir,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.wroteFiles).toBe(false);
    expect(outcome.report.missingSourceTypeEvidenceRefs).toEqual([
      "TEST-EV-01",
      "TEST-EV-02",
    ]);
    expect(outcome.report.issues[0]?.message).toMatch(/rev2/i);

    // Verify outDir was NOT created or populated on failure
    await expect(access(outDir)).rejects.toThrow();
  });

  it("fails when a 'verified' fact is backed solely by 'secondary' evidence and succeeds when paired with an official source", () => {
    const entitiesCsv = [
      "entity_code,entity_type,canonical_name_ar,canonical_name_en,aliases,sector_code,status,description",
      "TEST-LINE-01,transit_line,خط اختباري,Synthetic Line,خط ١,EAST,operational,",
    ].join("\n");

    const evidenceJson = JSON.stringify([
      {
        evidence_ref: "TEST-EV-SEC",
        source_url: null,
        publisher: "Synthetic Internal Guide",
        title: "Internal Summary",
        note: null,
        source_type: "secondary",
        published_date: "2026-11-13",
        accessed_date: "2026-11-13",
      },
      {
        evidence_ref: "TEST-EV-OFF",
        source_url: "https://example.gov.eg/line",
        publisher: "Synthetic Authority",
        title: "Official Statement",
        note: null,
        source_type: "official",
        published_date: "2026-06-27",
        accessed_date: "2026-11-13",
      },
    ]);

    const illegalVerified = adaptResearchSeedSources({
      entitiesCsv,
      evidenceJsonText: evidenceJson,
      factsJsonText: JSON.stringify([
        {
          entity_code: "TEST-LINE-01",
          attribute_key: "stations",
          value: 22,
          unit: "stations",
          status_as_of: "2026-06-27",
          verification_state: "verified",
          evidence_ref: "TEST-EV-SEC",
        },
      ]),
    });

    expect(illegalVerified.ok).toBe(false);
    expect(illegalVerified.report.secondaryOnlyVerifiedFacts).toHaveLength(1);
    expect(
      illegalVerified.report.secondaryOnlyVerifiedFacts[0]?.factCode,
    ).toBe("F-TEST-LINE-01-STATIONS-1");

    // Array evidence_ref combining secondary + official must pass and produce 2 fact_evidence links
    const validArrayVerified = adaptResearchSeedSources({
      entitiesCsv,
      evidenceJsonText: evidenceJson,
      factsJsonText: JSON.stringify([
        {
          entity_code: "TEST-LINE-01",
          attribute_key: "stations",
          value: 22,
          unit: "stations",
          status_as_of: "2026-06-27",
          verification_state: "verified",
          evidence_ref: ["TEST-EV-SEC", "TEST-EV-OFF"],
        },
      ]),
    });

    expect(validArrayVerified.ok).toBe(true);
    expect(validArrayVerified.report.counts.factEvidenceLinks).toBe(2);
    expect(validArrayVerified.bundle?.facts[0]?.evidence_codes).toEqual([
      "TEST-EV-SEC",
      "TEST-EV-OFF",
    ]);
  });

  it("generates deterministic, order-independent, and verification-stable fact codes across conflicting claims", () => {
    const entitiesCsv = [
      "entity_code,entity_type,canonical_name_ar,canonical_name_en,aliases,sector_code,status,description",
      "TEST-ROAD-RING,road,طريق دائري اختباري,Synthetic Ring Road,الدائري|الطريق الدائري,REGIONAL,unknown,",
    ].join("\n");

    const evidenceJson = JSON.stringify([
      {
        evidence_ref: "TEST-EV-A",
        source_url: "https://example.gov.eg/a",
        publisher: "Official A",
        title: "Statement A",
        note: null,
        source_type: "official",
        published_date: "2021-04-30",
        accessed_date: "2026-11-13",
      },
      {
        evidence_ref: "TEST-EV-B",
        source_url: "https://example.org/news-b",
        publisher: "News B",
        title: "Article B",
        note: null,
        source_type: "news",
        published_date: "2020-12-18",
        accessed_date: "2026-11-13",
      },
    ]);

    const factsOrder1 = [
      {
        entity_code: "TEST-ROAD-RING",
        attribute_key: "length_km",
        value: 156,
        unit: "km",
        status_as_of: "2021-04-30",
        verification_state: "verified",
        evidence_ref: "TEST-EV-A",
      },
      {
        entity_code: "TEST-ROAD-RING",
        attribute_key: "length_km",
        value: 155,
        unit: "km",
        status_as_of: "2020-12-18",
        verification_state: "superseded",
        evidence_ref: "TEST-EV-B",
      },
    ];

    const factsOrder2WithUpdatedVerification = [
      {
        ...factsOrder1[1],
        verification_state: "disputed",
      },
      factsOrder1[0],
    ];

    const run1 = adaptResearchSeedSources({
      entitiesCsv,
      evidenceJsonText: evidenceJson,
      factsJsonText: JSON.stringify(factsOrder1),
    });
    const run2 = adaptResearchSeedSources({
      entitiesCsv,
      evidenceJsonText: evidenceJson,
      factsJsonText: JSON.stringify(factsOrder2WithUpdatedVerification),
    });

    expect(run1.ok).toBe(true);
    expect(run2.ok).toBe(true);
    expect(run1.bundle?.facts.map((f) => [f.code, f.value])).toEqual([
      ["F-TEST-ROAD-RING-LENGTH-KM-1", "155"],
      ["F-TEST-ROAD-RING-LENGTH-KM-2", "156"],
    ]);
    // Same codes even when input array order is reversed AND verification_state changes!
    expect(run2.bundle?.facts.map((f) => [f.code, f.value])).toEqual([
      ["F-TEST-ROAD-RING-LENGTH-KM-1", "155"],
      ["F-TEST-ROAD-RING-LENGTH-KM-2", "156"],
    ]);
  });

  it("auto-selects *_rev2 files over rev1 when both exist in input directory", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "entities.csv"), "rev1");
    await writeFile(path.join(dir, "evidence.json"), "[]");
    await writeFile(path.join(dir, "facts.json"), "[]");
    await writeFile(path.join(dir, "entities_rev2.csv"), "rev2");
    await writeFile(path.join(dir, "evidence_rev2.json"), "[]");
    await writeFile(path.join(dir, "facts_rev2.json"), "[]");

    const autoResolved = await resolveResearchSeedFiles({ inputDir: dir });
    expect(autoResolved.selectedRevision).toBe("rev2");
    expect(path.basename(autoResolved.entitiesPath)).toBe("entities_rev2.csv");

    const explicitRev1 = await resolveResearchSeedFiles({
      inputDir: dir,
      revision: 1,
    });
    expect(explicitRev1.selectedRevision).toBe("rev1");
    expect(path.basename(explicitRev1.entitiesPath)).toBe("entities.csv");
  });
});
