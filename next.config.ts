import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ["*.e2b.app", "*.vercel.app"],
  outputFileTracingIncludes: {
    "/api/admin/import-seed": ["./data/seed/**/*", "./data/features/**/*"],
    "/entity/[code]": ["./data/seed/**/*", "./data/features/features.geojson", "./data/derived/entity-map-geometries.json"],
  },
};

export default nextConfig;
