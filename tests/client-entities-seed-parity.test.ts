import { beforeAll, describe, expect, it, vi } from "vitest";
import type { AtlasEntitySummary } from "@/components/atlas/atlas-client";
import { loadEntities } from "@/components/atlas/load-entities";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";

const state = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/db/client", () => ({ getSql: () => ({ query: async (sql: string, values: unknown[]) => {
  if (sql.includes("COUNT(*)")) return [{ total: state.rows.length }];
  return state.rows.slice(Number(values[6]), Number(values[6]) + Number(values[5]));
} }) }));
vi.mock("@/lib/atlas/area-boundaries", () => ({ getAreaBoundaryCodes: async () => new Set<string>() }));
import { GET } from "@/app/api/atlas/entities/route";

describe("client list against the entity API and canonical seed", () => {
  beforeAll(async () => {
    const dataset = await getStaticAtlasDataset();
    state.rows = dataset.entities.map((row) => ({ ...row, has_geometry: false }));
  });
  it("loads at least the API total, with every seed entity available to the client", async () => {
    const counts: number[] = [], updates: AtlasEntitySummary[][] = [];
    const mock: typeof fetch = async (url) => {
      const result = await GET(new Request(new URL(String(url), "https://example.test")));
      const payload = await result.clone().json();
      counts.push(payload.total);
      return result;
    };
    await loadEntities(new URLSearchParams("limit=500"), new AbortController().signal, (rows) => updates.push(rows), mock);
    const result = updates.at(-1)!;
    expect(counts).toEqual(Array(Math.ceil(state.rows.length / 500)).fill(state.rows.length));
    expect(result.length).toBe(counts[0]);
    expect(new Set(result.map((row) => row.code))).toEqual(new Set(state.rows.map((row) => row.code)));
    expect(state.rows.length).toBeGreaterThan(500);
  });
});
