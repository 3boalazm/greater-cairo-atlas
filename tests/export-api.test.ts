import { describe, expect, it } from "vitest";
import { CSV_HEADERS, csvForTable } from "@/lib/atlas/export-api";
import { computeAtlasDatasetChecksum } from "@/lib/db/automatic-import";
import { getExportMetadata, getStaticAtlasDataset, joinedFeatureCollection, getStaticEntityPageData } from "@/lib/atlas/static-dataset";

const root = process.cwd();

describe("atlas data exports", () => {
  it("emits canonical headers and export counts matching the dataset statistics", async () => {
    const [dataset, metadata] = await Promise.all([getStaticAtlasDataset(root), getExportMetadata(root)]);
    expect(metadata.counts).toEqual({
      entities: dataset.entities.length,
      facts: dataset.facts.length,
      evidence: dataset.evidence.length,
      fact_evidence: dataset.factEvidence.length,
      features: dataset.features.length,
    });
    await expect(metadata.import_checksum).toBe(await computeAtlasDatasetChecksum(root));
    for (const table of ["entities", "facts", "evidence", "fact_evidence"] as const) {
      expect(csvForTable(dataset, table).split("\r\n", 1)[0]).toBe(CSV_HEADERS[table].join(","));
    }
  });

  it("builds valid joined GeoJSON with entity code, names, type, and status", async () => {
    const [dataset, metadata] = await Promise.all([getStaticAtlasDataset(root), getExportMetadata(root)]);
    const collection = joinedFeatureCollection(dataset, metadata);
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toHaveLength(metadata.counts.features);
    expect(() => JSON.stringify(collection)).not.toThrow();
    for (const feature of collection.features) {
      expect(feature.type).toBe("Feature");
      expect(feature.geometry).toBeTruthy();
      expect(feature.properties.entity_code).toBeTruthy();
      expect(feature.properties.name_ar).toBeTruthy();
      expect(feature.properties.name_en).toBeTruthy();
      expect(feature.properties.entity_type).toBeTruthy();
      expect(feature.properties.status).toBeTruthy();
    }
  });

  it("returns no entity for an unknown identifier", async () => {
    await expect(getStaticEntityPageData("UNKNOWN-ENTITY-CODE", root)).resolves.toBeNull();
  });
});
