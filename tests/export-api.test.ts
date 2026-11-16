import { describe, expect, it } from "vitest";
import { CSV_HEADERS, csvForTable, exportResponseHeaders } from "@/lib/atlas/export-api";
import { GET as exportJson } from "@/app/api/exports/json/route";
import { GET as exportCsv } from "@/app/api/exports/csv/route";
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
      features: dataset.features.length + dataset.adminUnits.length,
    });
    await expect(metadata.import_checksum).toBe(await computeAtlasDatasetChecksum(root));
    expect(metadata.licenses.research_data).toBe("© Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0");
    expect(metadata.licenses.geometry).toContain("© OpenStreetMap contributors, ODbL 1.0");
    expect(metadata.licenses.administrative_boundaries).toContain("CAPMAS");
    expect(metadata.licenses.contact).toBe("01092500454 · 3boalazm@gmail.com");
    expect(metadata.licenses.code).toContain("No code license has been specified");
    const headers = new Headers(exportResponseHeaders(metadata, "application/json; charset=utf-8"));
    expect(headers.get("X-Atlas-Research-Data-License")).toBe("CC BY 4.0");
    expect(headers.get("X-Atlas-Research-Data-Copyright")).toBe("Mustafa Aboalazm");
    expect(headers.get("Cache-Control")).toBe("no-store, max-age=0");
    for (const table of ["entities", "facts", "evidence", "fact_evidence"] as const) {
      const lines = csvForTable(dataset, table).split("\r\n");
      expect(lines[0]).toContain("© Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0");
      expect(lines[1]).toContain("Contact: 01092500454 · 3boalazm@gmail.com");
      expect(lines[2]).toBe(CSV_HEADERS[table].join(","));
    }
  });

  it("keeps raw values and units in machine JSON and CSV exports", async () => {
    const dataset = await getStaticAtlasDataset(root);
    const json = await (await exportJson()).json();
    expect(json.facts).toEqual(dataset.facts);
    const csv = await (await exportCsv(new Request("https://atlas.test/api/exports/csv?table=facts"))).text();
    expect(csv).toBe(csvForTable(dataset, "facts"));
    expect(json.facts.some((fact: { unit: string | null }) => fact.unit === "million_passengers_per_day")).toBe(true);
    expect(csv).toContain("million_passengers_per_day");
  });

  it("builds valid joined GeoJSON with entity code, names, type, and status", async () => {
    const [dataset, metadata] = await Promise.all([getStaticAtlasDataset(root), getExportMetadata(root)]);
    const collection = joinedFeatureCollection(dataset, metadata);
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toHaveLength(metadata.counts.features);
    expect(collection.metadata.licenses.research_data).toBe(metadata.licenses.research_data);
    expect(collection.metadata.licenses.geometry).toBe(metadata.licenses.geometry);
    expect(() => JSON.stringify(collection)).not.toThrow();
    for (const feature of collection.features) {
      expect(feature.type).toBe("Feature");
      expect(feature.geometry).toBeTruthy();
      expect(feature.properties.entity_code).toBeTruthy();
      expect(feature.properties.name_ar).toBeTruthy();
      if (feature.properties.entity_type === "admin_unit" && feature.properties.level === 3) expect(feature.properties.name_en).toBe("");
      else expect(feature.properties.name_en).toBeTruthy();
      expect(feature.properties.entity_type).toBeTruthy();
      expect(feature.properties.status).toBeTruthy();
    }
  });

  it("returns no entity for an unknown identifier", async () => {
    await expect(getStaticEntityPageData("UNKNOWN-ENTITY-CODE", root)).resolves.toBeNull();
  });
});
