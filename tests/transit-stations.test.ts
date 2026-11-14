import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  TRANSIT_LINE_COLORS,
  TRANSIT_MODE_ORDER,
  transitModeLabel,
  transitModesForEntityCode,
} from "@/lib/atlas/transit-modes";

interface DerivedStationReport {
  lines: Array<{
    line_code: string;
    osm_station_count: number;
    official_count_comparison: { official_count: number; osm_count: number; difference: number } | null;
    relations: Array<{ relation_id: number; ordered_stations: Array<{ osm_node_id: number; osm_node_version: number | null; member_role: string }> }>;
  }>;
  stations: Array<{ osm_node_id: number; modes: string[]; interchange: boolean; existing_entities: Array<{ entity_code: string }> }>;
  existing_seed_stop_entities_mapped: string[];
  existing_seed_stop_entities_unmatched: string[];
}

describe("OSM-derived transit stations and mode styles", () => {
  it("records ordered relation stops and honest official-count comparisons without seed additions", async () => {
    const report = JSON.parse(await readFile(path.resolve(process.cwd(), "data/research/osm-stations/stations_from_osm.json"), "utf8")) as DerivedStationReport;
    const line = (code: string) => report.lines.find((item) => item.line_code === code);
    expect(line("TRANSIT-METRO-L1")).toMatchObject({ osm_station_count: 35, official_count_comparison: { official_count: 35, osm_count: 35, difference: 0 } });
    expect(line("TRANSIT-METRO-L2")).toMatchObject({ osm_station_count: 20, official_count_comparison: { official_count: 20, osm_count: 20, difference: 0 } });
    expect(line("TRANSIT-METRO-L3")).toMatchObject({ osm_station_count: 34, official_count_comparison: { official_count: 34, osm_count: 34, difference: 0 } });
    expect(line("TRANSIT-LRT")).toMatchObject({ osm_station_count: 12, official_count_comparison: { official_count: 12, osm_count: 12, difference: 0 } });
    expect(line("TRANSIT-MONORAIL-EAST")).toMatchObject({ osm_station_count: 22, official_count_comparison: { official_count: 22, osm_count: 22, difference: 0 } });
    for (const code of ["TRANSIT-METRO-L1", "TRANSIT-METRO-L2", "TRANSIT-METRO-L3", "TRANSIT-LRT", "TRANSIT-MONORAIL-EAST"]) {
      const routes = line(code)?.relations ?? [];
      expect(routes.length).toBeGreaterThan(0);
      for (const route of routes) {
        expect(route.ordered_stations.length).toBeGreaterThan(0);
        expect(route.ordered_stations.every((stop) => stop.osm_node_id > 0 && ["stop", "platform"].includes(stop.member_role))).toBe(true);
      }
    }
    expect(report.existing_seed_stop_entities_mapped.length).toBeGreaterThan(0);
    expect(report.existing_seed_stop_entities_unmatched.length).toBeGreaterThan(0);
    expect(report.stations.some((station) => station.interchange)).toBe(true);
    expect(report.stations.some((station) => station.existing_entities.length > 0)).toBe(true);
  });

  it("publishes distinct colors and modes for all station types and interchanges", async () => {
    const collection = JSON.parse(await readFile(path.resolve(process.cwd(), "public/transit-stations.geojson"), "utf8")) as {
      metadata: { license: string };
      features: Array<{ properties: { mode: string; modes: string[]; interchange: boolean; osm_node_id: number; osm_node_version: number | null } }>;
    };
    expect(collection.metadata.license).toBe("ODbL-1.0");
    expect(collection.features.length).toBeGreaterThan(100);
    expect(collection.features.every((feature) => feature.properties.osm_node_id > 0)).toBe(true);
    expect(collection.features.some((feature) => feature.properties.interchange)).toBe(true);
    expect(TRANSIT_MODE_ORDER).toEqual(["metro", "metro_l4", "lrt", "monorail_east", "monorail_west", "brt", "enr", "hsr", "unclassified"]);
    expect(TRANSIT_LINE_COLORS["TRANSIT-METRO-L1"]).toBe("#c8202f");
    expect(TRANSIT_LINE_COLORS["TRANSIT-METRO-L2"]).toBe("#e2b527");
    expect(TRANSIT_LINE_COLORS["TRANSIT-METRO-L3"]).toBe("#08783e");
  });

  it("publishes attributed, status-classified and generalized rail context with a separate lazy detail payload", async () => {
    const low = JSON.parse(await readFile(path.resolve(process.cwd(), "public/rail-network.geojson"), "utf8")) as {
      metadata: { license: string; attribution: string; simplification_tolerance_m: number };
      features: Array<{ geometry: { type: string }; properties: { rail_status: string; license: string } }>;
    };
    const detail = JSON.parse(await readFile(path.resolve(process.cwd(), "public/rail-network-detail.geojson"), "utf8")) as {
      metadata: { simplification_tolerance_m: number };
      features: Array<{ geometry: { type: string }; properties: { rail_status: string } }>;
    };
    const status = JSON.parse(await readFile(path.resolve(process.cwd(), "public/rail-network-status.json"), "utf8")) as { available: boolean; feature_count: number };
    expect(status.available).toBe(true);
    expect(low.metadata).toMatchObject({ license: "ODbL-1.0", attribution: "© OpenStreetMap contributors, ODbL 1.0", simplification_tolerance_m: 100 });
    expect(detail.metadata.simplification_tolerance_m).toBe(12);
    expect(low.features.some((feature) => feature.properties.rail_status === "operational")).toBe(true);
    expect(low.features.some((feature) => feature.properties.rail_status === "under_construction")).toBe(true);
    expect(low.features.some((feature) => feature.properties.rail_status === "disused")).toBe(true);
    expect(low.features.some((feature) => feature.geometry.type === "Point")).toBe(true);
    expect(detail.features.every((feature) => feature.geometry.type !== "Point")).toBe(true);
  });

  it("maps existing STOP/RAIL entities to explicit mode labels and interchange modes", () => {
    expect(transitModesForEntityCode("STOP-M1-EL-MARG")).toEqual(["metro"]);
    expect(transitModesForEntityCode("STOP-LRT-BADR")).toEqual(["lrt"]);
    expect(transitModesForEntityCode("STOP-MRE-CBD")).toEqual(["monorail_east"]);
    expect(transitModesForEntityCode("STOP-BRT-MAADI")).toEqual(["brt"]);
    expect(transitModesForEntityCode("RAIL-RAMSES")).toEqual(["enr"]);
    expect(transitModesForEntityCode("STOP-ADLY-MANSOUR")).toEqual(["metro", "lrt"]);
    expect(transitModeLabel("STOP-ADLY-MANSOUR", "ar")).toBe("محطة تبادلية");
  });
});
