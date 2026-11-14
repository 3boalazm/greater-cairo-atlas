import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ["*.e2b.app", "*.vercel.app"],
  async headers() {
    return [
      {
        source: "/road-network.geojson",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" }, { key: "X-Atlas-Geometry-Attribution", value: "© OpenStreetMap contributors, ODbL 1.0" }],
      },
      {
        source: "/road-network-detail.geojson",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" }, { key: "X-Atlas-Geometry-Attribution", value: "© OpenStreetMap contributors, ODbL 1.0" }],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/admin/import-seed": ["./data/seed/**/*", "./data/features/**/*"],
    "/entity/[code]": ["./data/seed/**/*", "./data/features/features.geojson", "./data/features/boundaries.geojson", "./data/derived/entity-map-geometries.json"],
    "/api/atlas/entities/[code]/boundary": ["./data/features/boundaries.geojson"],
    "/api/atlas/entities": ["./data/features/boundaries.geojson"],
    "/api/atlas/entities/[code]": ["./data/features/boundaries.geojson"],
  },
};

export default nextConfig;
