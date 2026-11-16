import { describe, expect, it, vi } from "vitest";
import { loadEntities } from "@/components/atlas/load-entities";
import type { AtlasEntitySummary } from "@/components/atlas/atlas-client";

function entity(index: number): AtlasEntitySummary {
  return { code: `ENTITY-${index}`, name_ar: `${index}`, name_en: `${index}`, aliases: [], entity_type: "road", sector: "WEST", status: "unknown", has_geometry: false };
}
function response(entities: AtlasEntitySummary[], total: number, offset: number) {
  return Response.json({ entities, total, limit: 500, offset });
}

describe("client entity paging", () => {
  it("publishes all 1,234 entities in API order in three requests, without duplicate codes", async () => {
    const rows = Array.from({ length: 1234 }, (_, i) => entity(i));
    const calls: string[] = [], updates: AtlasEntitySummary[][] = [];
    const mock: typeof fetch = async (url) => {
      calls.push(String(url));
      const offset = Number(new URL(String(url), "https://example.test").searchParams.get("offset") ?? 0);
      return response(rows.slice(offset, offset + 500), rows.length, offset);
    };
    await loadEntities(new URLSearchParams("limit=500&sector=WEST"), new AbortController().signal, (page) => updates.push(page), mock);
    expect(calls).toEqual(["/api/atlas/entities?limit=500&sector=WEST", "/api/atlas/entities?limit=500&sector=WEST&offset=500", "/api/atlas/entities?limit=500&sector=WEST&offset=1000"]);
    expect(updates.map((page) => page.length)).toEqual([500, 1000, 1234]);
    expect(updates.at(-1)).toEqual(rows);
    expect(new Set(updates.at(-1)!.map((row) => row.code)).size).toBe(1234);
  });

  it("aborts an old filter's in-flight pages and never publishes them after a new filter starts", async () => {
    const old = new AbortController();
    const current = new AbortController();
    const updates: string[][] = [];
    let resolveOld!: (value: Response) => void;
    let notifyOldPage!: () => void;
    const oldPageStarted = new Promise<void>((resolve) => { notifyOldPage = resolve; });
    const calls: string[] = [];
    const mock: typeof fetch = async (url, init) => {
      const query = new URL(String(url), "https://example.test").searchParams;
      calls.push(`${query.get("sector")}:${query.get("offset") ?? 0}`);
      if (query.get("sector") === "WEST" && query.has("offset")) {
        expect(init?.signal).toBe(old.signal);
        notifyOldPage();
        // Simulate a transport that resolves even after abort: stale data must still be ignored.
        return new Promise<Response>((resolve) => { resolveOld = resolve; });
      }
      if (query.get("sector") === "WEST") return response(Array.from({ length: 500 }, (_, i) => entity(i)), 1001, 0);
      return response([{ ...entity(2000), sector: "NORTH" }], 1, 0);
    };
    const publish = (rows: AtlasEntitySummary[]) => updates.push(rows.map((row) => row.sector));
    const previous = loadEntities(new URLSearchParams("sector=WEST"), old.signal, publish, mock);
    await oldPageStarted;
    old.abort();
    await loadEntities(new URLSearchParams("sector=NORTH"), current.signal, publish, mock);
    resolveOld(response([entity(500)], 1001, 500));
    await expect(previous).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toEqual(["WEST:0", "WEST:500", "NORTH:0"]);
    expect(updates.map((rows) => [rows.length, rows[0]])).toEqual([[500, "WEST"], [1, "NORTH"]]);
  });

  it("keeps published pages on later failure and rejects for the existing error state", async () => {
    const updates: AtlasEntitySummary[][] = [];
    const mock: typeof fetch = async (url) => new URL(String(url), "https://example.test").searchParams.has("offset")
      ? Response.json({ error: { message: "page failed" } }, { status: 503 })
      : response(Array.from({ length: 500 }, (_, i) => entity(i)), 535, 0);
    await expect(loadEntities(new URLSearchParams(), new AbortController().signal, (page) => updates.push(page), mock)).rejects.toThrow("page failed");
    expect(updates.map((page) => page.length)).toEqual([500]);
  });

  it("deduplicates overlapping pages and surfaces an incomplete result rather than silently succeeding", async () => {
    const first = Array.from({ length: 500 }, (_, i) => entity(i));
    const updates: AtlasEntitySummary[][] = [];
    const mock = vi.fn<typeof fetch>(async (url) => new URL(String(url), "https://example.test").searchParams.has("offset")
      ? response([entity(499), entity(500)], 502, 500) : response(first, 502, 0));
    await expect(loadEntities(new URLSearchParams(), new AbortController().signal, (page) => updates.push(page), mock)).rejects.toThrow("incomplete");
    expect(updates.at(-1)).toEqual([...first, entity(500)]);
  });
});
