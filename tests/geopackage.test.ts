import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { generateGeoPackage, parseGeoPackageFilters } from "@/lib/atlas/geopackage";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";

describe("pure JavaScript GeoPackage exports", () => {
  it("validates filters and emits a readable GeoPackage with geometry and license attribution", async () => {
    expect(() => parseGeoPackageFilters(new URLSearchParams("type=made-up"))).toThrow();
    expect(parseGeoPackageFilters(new URLSearchParams("sector=NORTH&year=2020"))).toEqual({ sector: "NORTH", year: 2020 });
    const bytes = await generateGeoPackage(await getStaticAtlasDataset());
    const SQL = await initSqlJs({ locateFile: () => `${process.cwd()}/node_modules/sql.js/dist/sql-wasm.wasm` });
    const db = new SQL.Database(bytes);
    try {
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]!.values.flat().map(String);
      expect(tables).toContain("gpkg_contents");
      expect(tables).toContain("gpkg_geometry_columns");
      expect(tables).toContain("entities");
      expect(tables).toContain("features");
      expect(tables).toContain("admin_units");
      expect(tables).toContain("license_attribution");
      expect(Number(db.exec("SELECT COUNT(*) FROM features")[0]!.values[0]![0])).toBeGreaterThan(0);
      expect(Number(db.exec("SELECT COUNT(*) FROM admin_units")[0]!.values[0]![0])).toBe(838);
      expect(db.exec("SELECT license,attribution FROM admin_units LIMIT 1")[0]!.values[0]).toEqual(["CC-BY-IGO", expect.stringContaining("CAPMAS")]);
      expect(db.exec("SELECT hex(substr(geom,1,2)) FROM features LIMIT 1")[0]!.values[0]![0]).toBe("4750");
      expect(db.exec("SELECT COUNT(*) FROM license_attribution")[0]!.values[0]![0]).toBe(4);
      expect(db.exec("PRAGMA integrity_check")[0]!.values[0]![0]).toBe("ok");
    } finally { db.close(); }
  });

  it("filters by sector and creates a compact attribute/feature subset", async () => {
    const data = await getStaticAtlasDataset();
    const bytes = await generateGeoPackage(data, { sector: "NORTH" });
    const SQL = await initSqlJs({ locateFile: () => `${process.cwd()}/node_modules/sql.js/dist/sql-wasm.wasm` });
    const db = new SQL.Database(bytes);
    try {
      expect(Number(db.exec("SELECT COUNT(*) FROM entities WHERE sector <> 'NORTH'")[0]!.values[0]![0])).toBe(0);
      expect(Number(db.exec("SELECT COUNT(*) FROM features")[0]!.values[0]![0])).toBeGreaterThan(0);
    } finally { db.close(); }
  });
});
