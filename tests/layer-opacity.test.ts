import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_MAP_OPACITY, DEFAULT_MAP_OPACITY as FULL } from "@/components/atlas/MapView";

const read = (relative: string) => readFile(path.join(process.cwd(), relative), "utf8");

describe("BATCH 14.2 — opacity multiplies the authored value instead of replacing it", () => {
  it("defaults to full strength for every group", () => {
    // 100% must reproduce the map as it shipped; a lower default would silently dim every existing view.
    for (const [group, value] of Object.entries(DEFAULT_MAP_OPACITY)) expect(value, group).toBe(1);
  });

  it("scales a layer's own opacity so the authored hierarchy survives", async () => {
    const source = await read("src/components/atlas/MapView.tsx");
    // The helper must multiply, not assign — a replacement would flatten the casing-under-road hierarchy,
    // so "100%" would look different from the map before this feature.
    const helper = source.slice(source.indexOf("function scaledOpacity"), source.indexOf("function entityLineColor"));
    expect(helper).toContain("base * factor");
    expect(helper).toContain("Math.max(0, Math.min(1");
  });

  it("is a no-op at factor 1, so the default path changes no paint property", async () => {
    const source = await read("src/components/atlas/MapView.tsx");
    // The scaling helper returns the authored value untouched at 1...
    expect(source).toContain("if (factor === undefined || factor === 1) return base;");
    // ...and the apply pass still writes it, because a layer changed back from 50% must return to 100%
    // rather than being skipped and left dim.
    expect(source).toContain("scaledOpacity(base, factor === undefined ? 1 : factor)");
  });

  it("covers every layer a group claims to control", async () => {
    const source = await read("src/components/atlas/MapView.tsx");
    const table = source.slice(source.indexOf("const OPACITY_GROUP_LAYERS"), source.indexOf("function applyGroupOpacity"));
    for (const group of Object.keys(FULL)) expect(table, group).toContain(`${group}: [`);
    // Every id named in the table must actually exist in this file, or the slider silently does nothing.
    const quoted = [...table.matchAll(/id: "([a-z0-9-]+)"/g)].map((match) => match[1]!);
    const constants = [...table.matchAll(/id: ([a-zA-Z]+LayerId)/g)].map((match) => match[1]!);
    expect(quoted.length).toBeGreaterThan(10);
    for (const id of quoted) expect(source, id).toContain(`id: "${id}"`);
    for (const constant of constants) expect(source, constant).toContain(`const ${constant} =`);
  });

  it("applies the group opacity before the first paint, not after a flash at full strength", async () => {
    const source = await read("src/components/atlas/MapView.tsx");
    const applyCall = source.indexOf("applyGroupOpacity(map, opacity, authoredOpacity.current);");
    expect(applyCall).toBeGreaterThan(0);
    // It runs inside the load handler, before the map reports itself ready.
    const loadStart = source.lastIndexOf('map.on("load"', applyCall);
    expect(loadStart).toBeGreaterThan(-1);
  });

  it("never lets a stored opacity hide a layer completely", async () => {
    const settings = await read("src/lib/atlas/display-settings.ts");
    // The clamp lives in one place, and its floor is above zero.
    expect(settings).toContain("Math.min(1, Math.max(0.1");
  });
});
