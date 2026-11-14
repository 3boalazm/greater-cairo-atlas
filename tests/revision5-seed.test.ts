import path from "node:path";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadAndValidateFeatureCollection } from "@/lib/atlas/features";
import { loadAndValidateSeedDir, summarizeValidatedSeedBundle } from "@/lib/atlas/seed";

describe("revision 5 seed + OSM geometry delivery", () => {
  it("preserves the rev4 entity identity and fact-code baseline", async () => {
    const root = process.cwd();
    const [baseline, bundle] = await Promise.all([
      readFile(path.join(root, "data/research/rev5/rev4-compatibility-baseline.json"), "utf8").then((text) => JSON.parse(text) as {
        entities: Array<{ code: string; name_ar: string; name_en: string; entity_type: string }>;
        fact_codes: string[];
        feature_codes: string[];
        evidence_codes: string[];
      }),
      loadAndValidateSeedDir(path.join(root, "data/seed")),
    ]);
    const currentEntities = new Map(bundle.entities.map((entity) => [entity.code, entity]));
    for (const prior of baseline.entities) {
      const current = currentEntities.get(prior.code);
      expect(current, `missing rev4 entity ${prior.code}`).toBeDefined();
      expect(current).toMatchObject(prior);
    }
    const currentFactCodes = new Set(bundle.facts.map((fact) => fact.code));
    for (const code of baseline.fact_codes) expect(currentFactCodes.has(code), `missing rev4 fact ${code}`).toBe(true);
    const currentEvidenceCodes = new Set(bundle.evidence.map((item) => item.code));
    for (const code of baseline.evidence_codes) expect(currentEvidenceCodes.has(code), `missing rev4 evidence ${code}`).toBe(true);
    const featureCollection = JSON.parse(await readFile(path.join(root, "data/features/features.geojson"), "utf8")) as { features: Array<{ properties: { code: string } }> };
    const currentFeatureCodes = new Set(featureCollection.features.map((feature) => feature.properties.code));
    for (const code of baseline.feature_codes) expect(currentFeatureCodes.has(code), `missing previous feature ${code}`).toBe(true);
  });

  it("validates rev5 counts and requires official URL-backed evidence for every verified fact", async () => {
    const bundle = await loadAndValidateSeedDir(path.join(process.cwd(), "data/seed"));
    const report = summarizeValidatedSeedBundle(bundle);
    expect(report).toMatchObject({
      entitiesCount: 342,
      entitiesWithAliasesCount: 232,
      evidenceCount: 198,
      evidenceMissingUrlCount: 6,
      factsCount: 1108,
      factEvidenceLinksCount: 1218,
    });
    const evidence = new Map(bundle.evidence.map((item) => [item.code, item]));
    const verified = bundle.facts.filter((fact) => fact.verification_state === "verified");
    expect(verified).toHaveLength(294);
    for (const fact of verified) {
      expect(fact.evidence_codes.some((code) => {
        const item = evidence.get(code);
        return item?.source_type === "official" && item.url !== null;
      }), `${fact.code} has no URL-backed official evidence`).toBe(true);
    }
  });

  it("keeps requested road/metro aliases and expected OSM matches", async () => {
    const bundle = await loadAndValidateSeedDir(path.join(process.cwd(), "data/seed"));
    const byCode = new Map(bundle.entities.map((entity) => [entity.code, entity]));
    expect(byCode.get("ROAD-RING-ROAD")?.aliases).toEqual(expect.arrayContaining(["الطريق الدائري", "The Ring Road"]));
    const features = await loadAndValidateFeatureCollection(
      path.join(process.cwd(), "data/features/features.geojson"), bundle.entities, bundle.evidence,
    );
    const byEntity = new Map<string, number>();
    for (const feature of features) byEntity.set(feature.entity_code, (byEntity.get(feature.entity_code) ?? 0) + 1);
    expect(features).toHaveLength(3688);
    expect(byEntity.get("ROAD-RING-ROAD")).toBe(800);
    expect(byEntity.get("ROAD-MIDDLE-RING")).toBe(249);
    expect(byEntity.get("ROAD-REGIONAL-RING")).toBe(907);
    expect(byEntity.get("TRANSIT-METRO-L1")).toBe(13);
    expect(byEntity.get("TRANSIT-METRO-L2")).toBe(2);
    expect(byEntity.get("TRANSIT-METRO-L3")).toBe(17);
  });
});
