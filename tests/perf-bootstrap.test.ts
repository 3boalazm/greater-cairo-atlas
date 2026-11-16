import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/atlas/features/snapshot/route";
import { getStaticMapFeatures } from "@/lib/atlas/static-map-features";

const read = (file: string) => readFile(file, "utf8");

describe("first-paint payload and map fallback", () => {
  it("preserves the complete source snapshot and all Batch 20 features", async () => {
    const collection = await getStaticMapFeatures();
    const batch = collection.features.filter((feature) => feature.id.startsWith("BATCH20-"));
    expect(batch).toHaveLength(31);
    const response = await GET(new Request("http://localhost/api/atlas/features/snapshot?zoom=9"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.features).toEqual(collection.features);
  });

  it("filters the snapshot without changing provenance or status", async () => {
    const response = await GET(new Request("http://localhost/api/atlas/features/snapshot?zoom=9&type=landmark&sector=CENTRAL&status=operational"));
    const payload = await response.json();
    expect(payload.features.length).toBeGreaterThan(0);
    expect(payload.features.every((feature: { properties: { type: string; status: string } }) => feature.properties.type === "landmark" && feature.properties.status === "operational")).toBe(true);
    expect(payload.features.some((feature: { properties: { entity_code: string } }) => feature.properties.entity_code === "LANDMARK-CAIRO-TOWER")).toBe(true);
  });

  it("does not serialize the full geometry into the initial HTML and defers map and entity panel", async () => {
    const page = await read("src/app/page.tsx");
    const app = await read("src/components/atlas/AtlasApp.tsx");
    expect(page).not.toContain("initialFeatures={initialFeatures}");
    expect(page).toContain("initialAlternatives={initialAlternatives}");
    expect(app).toContain('import("./MapView")');
    expect(app).toContain('import("./EntityPanel")');
    expect(app).toContain("/api/atlas/features/snapshot?");
    expect(app).toContain('params.get("entity")');
  });
});
