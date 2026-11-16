import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ["*.e2b.app", "*.vercel.app"],
  async headers() {
    return [
      {
        source: "/road-network.geojson",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" }, { key: "X-Atlas-Geometry-Attribution", value: "(c) OpenStreetMap contributors, ODbL 1.0" }],
      },
      {
        source: "/road-network-detail.geojson",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" }, { key: "X-Atlas-Geometry-Attribution", value: "(c) OpenStreetMap contributors, ODbL 1.0" }],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/admin/import-seed": ["./data/seed/**/*", "./data/features/**/*"],
    "/api/exports/geopackage": ["./data/seed/**/*", "./data/features/**/*", "./node_modules/sql.js/dist/sql-wasm.wasm"],
    "/api/exports/geojson": ["./data/seed/**/*", "./data/features/**/*"],
    "/api/exports/json": ["./data/seed/**/*", "./data/features/**/*"],
    "/api/exports/csv": ["./data/seed/**/*", "./data/features/**/*"],
    "/": ["./data/seed/**/*", "./data/features/features.geojson", "./data/features/codab-admin-units.geojson", "./data/features/boundaries.geojson"],
    "/entity/[code]": ["./data/seed/**/*", "./data/features/features.geojson", "./data/features/boundaries.geojson", "./data/features/codab-entity-boundaries.geojson", "./data/features/codab-relations.json", "./data/features/codab-admin-units.geojson", "./data/derived/entity-map-geometries.json"],
    "/api/atlas/features": ["./data/features/codab-admin-units.geojson"],
    "/api/atlas/stats": ["./data/seed/**/*", "./data/features/**/*"],
    "/api/admin/dashboard": ["./data/seed/**/*", "./data/features/boundaries.geojson", "./data/features/codab-entity-boundaries.geojson"],
    "/api/atlas/evidence": ["./data/seed/**/*", "./data/features/**/*"],
    "/api/atlas/evidence/[code]": ["./data/seed/**/*", "./data/features/**/*"],
    "/api/exports/entities/[code]": ["./data/seed/**/*", "./data/features/**/*", "./data/derived/entity-map-geometries.json"],
    "/api/atlas/relations": ["./data/seed/**/*", "./data/features/features.geojson", "./data/features/codab-relations.json"],
    "/api/atlas/entities/[code]/boundary": ["./data/features/boundaries.geojson", "./data/features/codab-entity-boundaries.geojson"],
    "/api/atlas/entities": ["./data/features/boundaries.geojson", "./data/features/codab-entity-boundaries.geojson"],
    "/api/atlas/entities/[code]": ["./data/features/boundaries.geojson", "./data/features/codab-entity-boundaries.geojson"],
  },
};

export default nextConfig;
