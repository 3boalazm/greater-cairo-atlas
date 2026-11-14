import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFeaturesMock, loggerErrorMock } = vi.hoisted(() => ({
  getFeaturesMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/atlas/features-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/atlas/features-api")>();
  return { ...actual, getAtlasFeatures: getFeaturesMock };
});
vi.mock("@/lib/logger", () => ({ logger: { error: loggerErrorMock } }));

import { GET } from "@/app/api/atlas/features/route";

describe("GET /api/atlas/features diagnostics", () => {
  beforeEach(() => {
    getFeaturesMock.mockReset();
    loggerErrorMock.mockReset();
  });

  it("logs the query and redacted PostgreSQL diagnostics while keeping the response generic", async () => {
    const cause = Object.assign(
      new Error("column missing while connecting postgres://user:super-secret@db.example.test/atlas"),
      { code: "42803" },
    );
    getFeaturesMock.mockRejectedValue(cause);

    const response = await GET(new Request("https://atlas.test/api/atlas/features?zoom=10"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected server error occurred." },
    });
    expect(loggerErrorMock).toHaveBeenCalledWith("Atlas features request failed", expect.objectContaining({
      route: "/api/atlas/features",
      query: "atlas_features_geojson_by_filter_and_zoom",
      error_name: "Error",
      error_message: "column missing while connecting postgres://[REDACTED]@db.example.test",
      postgres_code: "42803",
    }));
    expect(JSON.stringify(body)).not.toContain("super-secret");
  });

  it("does not log expected query validation errors at error level", async () => {
    const response = await GET(new Request("https://atlas.test/api/atlas/features?zoom=99"));
    expect(response.status).toBe(400);
    expect(getFeaturesMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });
});
