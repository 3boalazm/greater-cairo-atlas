import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getSql: () => ({ query: queryMock }) }));

import { GET as listEntities } from "@/app/api/atlas/entities/route";
import { GET as getEntity } from "@/app/api/atlas/entities/[code]/route";
import { parseAtlasEntityListQuery } from "@/lib/atlas/entities-api";

const entityRow = {
  code: "ROAD-RING-ROAD", name_ar: "الدائري", name_en: "Ring Road",
  aliases: ["الدائري القديم"], entity_type: "road", sector: "CENTRAL",
  status: "operational", has_geometry: true,
};

describe("GET /api/atlas/entities", () => {
  beforeEach(() => queryMock.mockReset());

  it("parses bounded filters and rejects unsupported query values", () => {
    expect(parseAtlasEntityListQuery(new URLSearchParams("q=Ring&type=road&sector=CENTRAL&status=operational&has_geometry=false&limit=20")))
      .toEqual({ q: "Ring", type: "road", sector: "CENTRAL", status: "operational", has_geometry: false, limit: 20, offset: 0 });
    expect(parseAtlasEntityListQuery(new URLSearchParams("has_geometry=true"))).toMatchObject({ has_geometry: true });
    expect(() => parseAtlasEntityListQuery(new URLSearchParams("has_geometry=yes"))).toThrow(/Invalid entity query/);
    expect(() => parseAtlasEntityListQuery(new URLSearchParams("type=not-real"))).toThrow(/Invalid entity query/);
    expect(() => parseAtlasEntityListQuery(new URLSearchParams("limit=999"))).toThrow(/Invalid entity query/);
  });

  it("returns compact real entity summaries and has_geometry with cache headers", async () => {
    queryMock.mockImplementation((sql?: string) => String(sql ?? "").includes("COUNT(*)") ? [{ total: 1 }] : [entityRow]);
    const response = await listEntities(new Request("http://atlas.test/api/atlas/entities?q=Ring&limit=20"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
    expect(await response.json()).toEqual({ entities: [entityRow], total: 1, limit: 20, offset: 0 });
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0]?.[1]).toEqual(["Ring", null, null, null, null]);
  });

  it("does not query the database for invalid filters", async () => {
    const response = await listEntities(new Request("http://atlas.test/api/atlas/entities?status=imaginary"));
    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/atlas/entities/[code]", () => {
  beforeEach(() => queryMock.mockReset());

  it("returns entity, conflicting facts, precision, and provenance records", async () => {
    const facts = [
      { code: "F-RING-A", attribute: "length", value: "110", unit: "km", valid_as_of: "2026-11-01", valid_as_of_precision: "month", verification_state: "verified", notes: null, evidence: [{ code: "EV-043", url: "https://example.gov/road", publisher: "Official publisher", title: "Road record", source_type: "official", published_date: null, accessed_date: "2026-11-13" }] },
      { code: "F-RING-B", attribute: "length", value: "118", unit: "km", valid_as_of: "2025-01-01", valid_as_of_precision: "year", verification_state: "disputed", notes: null, evidence: [{ code: "EV-050", url: "https://example.org/report", publisher: "Secondary outlet", title: "Estimate", source_type: "secondary", published_date: null, accessed_date: "2026-11-13" }] },
    ];
    queryMock.mockImplementation((sql?: string) => {
      const query = String(sql ?? "");
      if (query.includes("e.description")) return [{ ...entityRow, description: null }];
      if (query.includes("SELECT f.code")) return facts;
      return [];
    });
    const response = await getEntity(new Request("http://atlas.test/api/atlas/entities/ROAD-RING-ROAD"), { params: Promise.resolve({ code: "ROAD-RING-ROAD" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
    expect(await response.json()).toMatchObject({ ...entityRow, description: null, facts });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("returns 404 for a valid but missing entity and 400 for invalid codes", async () => {
    queryMock.mockResolvedValueOnce([]);
    const missing = await getEntity(new Request("http://atlas.test/api/atlas/entities/ROAD-NOT-THERE"), { params: Promise.resolve({ code: "ROAD-NOT-THERE" }) });
    expect(missing.status).toBe(404);
    const invalid = await getEntity(new Request("http://atlas.test/api/atlas/entities/nope"), { params: Promise.resolve({ code: "nope" }) });
    expect(invalid.status).toBe(400);
  });
});
