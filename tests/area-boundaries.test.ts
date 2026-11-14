import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { entitySeedSchema } from "@/lib/atlas/schema";
import { getAreaBoundary, getAreaBoundaryCodes, isAreaBoundaryFeature, isBoundaryEligibleEntity, matchOsmBoundaryElement } from "@/lib/atlas/area-boundaries";

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
