import { describe, expect, it } from "vitest";
import { GET as getBoundary } from "@/app/api/atlas/entities/[code]/boundary/route";
import { GET as getFeatures } from "@/app/api/atlas/features/route";
import { GET as getGeoJsonExport } from "@/app/api/exports/geojson/route";
import { GET as getGeoPackageExport } from "@/app/api/exports/geopackage/route";

const codes = ["DIST-DOKKI", "CITY-NEW-CAIRO"];
const assertAsciiHeaders = (headers: Headers) => {
  for (const [name, value] of headers.entries()) {
    expect(value, `non-ASCII response header ${name}: ${value}`).toMatch(/^[\x00-\x7F]*$/u);
  }
};

describe("official CAPMAS boundary API responses", () => {
  it.each(codes)("returns a GeoJSON FeatureCollection for %s", async (code) => {
    const response = await getBoundary(new Request(`https://atlas.test/api/atlas/entities/${code}/boundary`), {
      params: Promise.resolve({ code }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/geo+json");
    const body = await response.json();
    expect(body).toMatchObject({ type: "FeatureCollection", features: [expect.objectContaining({
      type: "Feature", properties: expect.objectContaining({
        entity_code: code, license: "CC BY-IGO",
        properties: expect.objectContaining({ source: "CAPMAS COD-AB 2017 (reviewed 2024)", attribution: expect.stringContaining("CAPMAS") }),
      }),
    })] });
  });

  it("keeps all emitted HTTP response header values ASCII across boundary, feature, GeoJSON, and GeoPackage routes", async () => {
    const responses = await Promise.all([
      ...codes.map((code) => getBoundary(new Request(`https://atlas.test/api/atlas/entities/${code}/boundary`), {
        params: Promise.resolve({ code }),
      })),
      getFeatures(new Request("https://atlas.test/api/atlas/features?type=admin_unit&level=2")),
      getGeoJsonExport(new Request("https://atlas.test/api/exports/geojson")),
      getGeoPackageExport(new Request("https://atlas.test/api/exports/geopackage")),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      assertAsciiHeaders(response.headers);
    }
  });
});
