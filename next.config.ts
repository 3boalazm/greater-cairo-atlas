import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ["*.e2b.app", "*.vercel.app"],
  outputFileTracingIncludes: {
    "/api/admin/import-seed": ["./data/seed/**/*"],
  },
};

export default nextConfig;
