import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TRANSIT_LINE_COLORS, TRANSIT_LINE_LABELS, TRANSIT_MODE_LABELS, TRANSIT_MODE_ORDER, transitModesForEntityCode } from "@/lib/atlas/transit-modes";

interface Feature {
  id: string;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown> & { properties?: Record<string, unknown> };
}

const featurePath = path.resolve(process.cwd(), "data/features/features.geojson");
const reportPath = path.resolve(process.cwd(), "data/features/match-report.json");

async function loadFeatures(): Promise<Feature[]> {
  const collection = JSON.parse(await readFile(featurePath, "utf8")) as { features: Feature[] };
  return collection.features;
}

describe("BRT line geometry from OSM highway=busway", () => {
  it("draws TRANSIT-BRT from named OSM busway ways only, with per-way ODbL provenance", async () => {
    const features = await loadFeatures();
    const lineFeatures = features.filter((feature) => feature.properties.entity_code === "TRANSIT-BRT");

    expect(lineFeatures.length).toBeGreaterThan(0);
    for (const feature of lineFeatures) {
      expect(feature.geometry?.type).toBe("LineString");
      expect(feature.properties.osm_type).toBe("way");
      expect(feature.properties.osm_id).toBeGreaterThan(0);
      expect(feature.properties.osm_version).toBeGreaterThan(0);
      expect(feature.properties.license).toBe("ODbL-1.0");
      const metadata = feature.properties.properties ?? {};
      expect(metadata.attribution).toBe("© OpenStreetMap contributors, ODbL 1.0");
      expect(metadata.source).toBe("OpenStreetMap");
      expect(metadata.entity_type).toBe("transit_line");
      expect(metadata.geometry_completeness).toBe("partial_source_geometry");
      const osmTags = metadata.osm_tags as Record<string, unknown>;
      expect(osmTags.highway).toBe("busway");
      expect(String(osmTags.name)).toMatch(/BRT|ترددي/u);
      const coordinates = (feature.geometry as { coordinates: number[][] }).coordinates;
      expect(coordinates.length).toBeGreaterThanOrEqual(2);
      for (const position of coordinates) {
        expect(position[0]).toBeGreaterThan(30.5);
        expect(position[0]).toBeLessThan(32.1);
        expect(position[1]).toBeGreaterThan(29.2);
        expect(position[1]).toBeLessThan(30.8);
      }
    }
  });

  it("records the partial-geometry audit without inventing station positions", async () => {
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      brt_osm_geometry: {
        geometry_status: string;
        accepted_osm_way_ids: number[];
        accepted_way_count: number;
        geometry_completeness_note: string;
      };
      brt_station_candidates: {
        seed_brt_station_entities: number;
        matched_entity_codes: string[];
        unmatched_entity_codes: string[];
        named_brt_source_nodes: Array<{ osm_id: number; name: string; matcher_outcome: string | null }>;
      };
      brt_station_proximity: { available: boolean; stations_with_geometry: number };
    };
    expect(report.brt_osm_geometry.geometry_status).toBe("partial_from_osm");
    expect(report.brt_osm_geometry.accepted_way_count).toBe(report.brt_osm_geometry.accepted_osm_way_ids.length);
    expect(report.brt_osm_geometry.accepted_osm_way_ids.length).toBeGreaterThan(0);
    expect(report.brt_osm_geometry.geometry_completeness_note).toMatch(/partial \(OSM\)/u);

    // Every seed BRT station is either matched to an accepted OSM node or explicitly reported unmatched.
    const { matched_entity_codes: matched, unmatched_entity_codes: unmatched, seed_brt_station_entities: total } = report.brt_station_candidates;
    expect(matched.length + unmatched.length).toBe(total);
    expect(new Set([...matched, ...unmatched]).size).toBe(total);

    // A name look-alike node is reported, never silently converted into geometry for another entity.
    const adlyNodes = report.brt_station_candidates.named_brt_source_nodes
      .filter((node) => /adly mansour/iu.test(node.name));
    expect(adlyNodes.length).toBeGreaterThan(0);
    for (const node of adlyNodes) {
      expect(node.matcher_outcome).not.toBe("matched");
    }
  });

  it("keeps only source-matched BRT station points, so no station is placed by guesswork", async () => {
    const features = await loadFeatures();
    const stationFeatures = features.filter((feature) => String(feature.properties.entity_code).startsWith("STOP-BRT-"));
    for (const feature of stationFeatures) {
      expect(feature.geometry?.type).toBe("Point");
      expect(feature.properties.osm_type).toBe("node");
      expect(feature.properties.license).toBe("ODbL-1.0");
      const metadata = feature.properties.properties ?? {};
      expect(String(metadata.match_method ?? metadata.source_station_modes)).toMatch(/exact|fact/iu);
    }
  });
});

describe("BRT styling and mode wiring", () => {
  it("gives BRT its own colour, label and icon slot inside the transit mode order", () => {
    expect(TRANSIT_MODE_ORDER).toContain("brt");
    expect(TRANSIT_MODE_LABELS.brt.color).toBe("#2477a8");
    expect(TRANSIT_MODE_LABELS.brt.shape).toBe("triangle");
    expect(TRANSIT_MODE_LABELS.brt.ar).toContain("الترددي");
    expect(TRANSIT_LINE_COLORS["TRANSIT-BRT"]).toBe(TRANSIT_MODE_LABELS.brt.color);
    expect(TRANSIT_LINE_LABELS["TRANSIT-BRT"]?.ar).toContain("الترددي");
    expect(transitModesForEntityCode("TRANSIT-BRT")).toEqual(["brt"]);
    expect(transitModesForEntityCode("STOP-BRT-EL-MARG")).toEqual(["brt"]);
  });
});
