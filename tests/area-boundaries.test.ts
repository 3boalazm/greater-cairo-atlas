import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { entitySeedSchema } from "@/lib/atlas/schema";
import { getCodabLocatedWithin } from "@/lib/atlas/static-dataset";
import { getAreaBoundary, getAreaBoundaryCodes, getOsmAreaBoundary, isAreaBoundaryFeature, isBoundaryEligibleEntity, matchOsmBoundaryElement } from "@/lib/atlas/area-boundaries";

const district = entitySeedSchema.parse({
  code: "DIST-TEST", name_ar: "حي الاختبار", name_en: "Test District",
  entity_type: "district", sector: "CENTRAL", status: "operational", aliases: [],
});

describe("OSM area boundary provenance and matching", () => {
  it("matches a tiny fixture only as a real named, versioned OSM administrative polygon", async () => {
    const fixture = JSON.parse(await readFile(path.join(process.cwd(), "tests/fixtures/osm-boundaries/minimal.json"), "utf8")) as {
      elements: Array<Record<string, unknown>>;
    };
    const matched = matchOsmBoundaryElement(fixture.elements[0]!, district);
    expect(matched).toMatchObject({
      type: "Feature", id: "OSM-BOUNDARY-WAY-987654321-DIST-TEST",
      geometry: { type: "Polygon" },
      properties: {
        entity_code: "DIST-TEST", osm_type: "way", osm_id: 987654321, osm_version: 7, license: "ODbL-1.0",
        properties: { role: "boundary", boundary_kind: "administrative", admin_level: "8", attribution: "© OpenStreetMap contributors, ODbL 1.0" },
      },
    });
    expect(isBoundaryEligibleEntity(district)).toBe(true);
    expect(isBoundaryEligibleEntity(entitySeedSchema.parse({ ...district, code: "ROAD-TEST", entity_type: "road" }))).toBe(false);
    expect(isAreaBoundaryFeature(matched)).toBe(true);
  });

  it("serves just the requested stored boundary and derives the presence index without loading polygons in the client payload", async () => {
    const fixture = JSON.parse(await readFile(path.join(process.cwd(), "tests/fixtures/osm-boundaries/minimal.json"), "utf8")) as {
      elements: Array<Record<string, unknown>>;
    };
    const feature = matchOsmBoundaryElement(fixture.elements[0]!, district)!;
    const root = await mkdtemp(path.join(os.tmpdir(), "gca-boundaries-"));
    try {
      const directory = path.join(root, "data/features");
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "boundaries.geojson"), JSON.stringify({ type: "FeatureCollection", features: [feature] }));
      expect(await getAreaBoundaryCodes(root)).toEqual(new Set(["DIST-TEST"]));
      expect(await getAreaBoundary("DIST-TEST", root)).toEqual(feature);
      expect(await getAreaBoundary("DIST-MISSING", root)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("stores expanded 07.5 coverage, an explicit Cairo Governorate label, and landuse provenance without the Bab block", async () => {
    const collection = JSON.parse(await readFile(path.join(process.cwd(), "data/features/boundaries.geojson"), "utf8")) as {
      features: Array<{ properties: { entity_code: string; osm_id: number; properties: Record<string, unknown> } }>;
    };
    expect(collection.features).toHaveLength(19);
    const cairo = collection.features.find((feature) => feature.properties.entity_code === "CITY-CAIRO");
    expect(cairo).toMatchObject({ properties: { osm_id: 4103336, properties: { display_label_ar: "حدود محافظة القاهرة", source_kind: "administrative" } } });
    expect(collection.features.some((feature) => feature.properties.entity_code === "DIST-BAB-SHAREYA")).toBe(false);
    expect(collection.features.some((feature) => feature.properties.entity_code === "CITY-SHUBRA-ELKHEIMA")).toBe(false);
    expect(collection.features.some((feature) => feature.properties.entity_code === "DIST-AGOUZA")).toBe(false);
    expect(collection.features.some((feature) => feature.properties.properties.source_kind === "landuse")).toBe(true);
    const report = JSON.parse(await readFile(path.join(process.cwd(), "data/features/match-report.json"), "utf8")) as {
      boundary_candidate_review: { entities: Record<string, { status: string; top_candidates: Array<{ osm_id: number; decision: string }> }> };
    };
    expect(report.boundary_candidate_review.entities["CITY-SHUBRA-ELKHEIMA"]).toMatchObject({
      status: "unmatched", top_candidates: [expect.objectContaining({ osm_id: 731047816, decision: expect.stringContaining("below entity-specific minimum 10 km²") })],
    });
    expect(report.boundary_candidate_review.entities["DIST-AGOUZA"]).toMatchObject({
      status: "unmatched", top_candidates: [expect.objectContaining({ osm_id: 723745381, decision: expect.stringContaining("below entity-specific minimum 2 km²") })],
    });
  });

  it("prefers the curated CAPMAS entity union while preserving the existing OSM geometry as an alternate", async () => {
    const [official, osm, codes] = await Promise.all([
      getAreaBoundary("DIST-DOKKI"), getOsmAreaBoundary("CITY-NEW-CAIRO"), getAreaBoundaryCodes(),
    ]);
    expect(official).toMatchObject({ properties: { entity_code: "DIST-DOKKI", license: "CC-BY-IGO", properties: { source: "CAPMAS COD-AB 2017 (reviewed 2024)" } } });
    expect(osm).toMatchObject({ properties: { entity_code: "CITY-NEW-CAIRO", license: "ODbL-1.0" } });
    expect(codes.has("DIST-DOKKI")).toBe(true);
    const newCairo = await getAreaBoundary("CITY-NEW-CAIRO");
    expect(newCairo?.properties.properties.name_ar).toBe("القاهرة الجديدة");
    const union = JSON.parse(await readFile(path.join(process.cwd(), "data/features/codab-entity-boundaries.geojson"), "utf8")) as { features: Array<{ properties: { entity_code: string; pcodes: string[] } }> };
    expect(union.features.find((feature) => feature.properties.entity_code === "CITY-NEW-CAIRO")?.properties.pcodes).toEqual(["EG0137", "EG0138", "EG0139"]);
    expect(union.features.some((feature) => feature.properties.entity_code === "DIST-SALAM-1")).toBe(false);
    await expect(getCodabLocatedWithin("DIST-SALAM-1")).resolves.toMatchObject({
      pcodes: ["EG0132"], names_ar: ["قسم السلام"], evidence_code: "EV-CODAB-ADMIN-2026",
    });
  });

  it("rejects point-only, wrong-name, unsupported-admin-level, and out-of-bounds candidates", async () => {
    const fixture = JSON.parse(await readFile(path.join(process.cwd(), "tests/fixtures/osm-boundaries/minimal.json"), "utf8")) as {
      elements: Array<Record<string, unknown>>;
    };
    const element = fixture.elements[0]!;
    expect(matchOsmBoundaryElement({ ...element, type: "node" }, district)).toBeNull();
    expect(matchOsmBoundaryElement({ ...element, tags: { boundary: "administrative", admin_level: "8", name: "Other place" } }, district)).toBeNull();
    expect(matchOsmBoundaryElement({ ...element, tags: { boundary: "administrative", admin_level: "4", name: "Test District" } }, district)).toBeNull();
    expect(matchOsmBoundaryElement(element, district, [31.3, 29.9, 31.5, 30.2])).toBeNull();
    expect(isAreaBoundaryFeature({ ...matchOsmBoundaryElement(element, district), properties: { ...matchOsmBoundaryElement(element, district)?.properties, osm_version: null } })).toBe(false);
  });
});
