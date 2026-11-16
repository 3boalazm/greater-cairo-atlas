import { readFileSync } from "node:fs";
import postcss, { type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");
const css = postcss.parse(read("src/app/globals.css"));

/** Resolve the authored backdrop declarations at either side of the sheet breakpoint. */
function backdropStyle(width: number) {
  const declarations: Record<string, string> = {};
  css.walkRules(".panel-backdrop", (rule: Rule) => {
    const parent = rule.parent;
    if (parent?.type === "atrule" && parent.name === "media") {
      const max = parent.params.match(/max-width:\s*(\d+)px/);
      if (!max || width > Number(max[1])) return;
    }
    rule.walkDecls((decl) => { declarations[decl.prop] = decl.value; });
  });
  return declarations;
}

describe("panel map interaction regressions", () => {
  it("does not render a desktop backdrop and lets mobile map gestures through", () => {
    expect(backdropStyle(1646).display).toBe("none");
    expect(backdropStyle(760)).toMatchObject({ display: "block", "pointer-events": "none" });
    const panel = read("src/components/atlas/EntityPanel.tsx");
    expect(panel).toContain('className="panel-backdrop" aria-hidden="true"');
    expect(panel).not.toContain('aria-modal="true"');
    expect(panel).not.toContain("trapTab");
    expect(panel).toContain('className="close-panel"');
    expect(read("src/components/atlas/AtlasApp.tsx")).toContain('event.key === "Escape"');
  });

  it("removes or confines closed search, info, and layers overlays", () => {
    const search = read("src/components/atlas/SearchCommand.tsx");
    expect(search).toMatch(/\{open && [\s\S]*?className="search-dismiss"/);
    expect(read("src/app/globals.css")).toContain('.atlas-info-menu:not([open]) nav { display: none; }');
    expect(read("src/app/globals.css")).toContain('.layers-panel:not([open]) { width: max-content;');
  });

  it("resizes on layout changes without a camera refit", () => {
    const map = read("src/components/atlas/MapView.tsx");
    const start = map.indexOf("const scheduleResize =");
    const end = map.indexOf("}, [mapReady, selectedCode]);", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const effect = map.slice(start, end);
    expect(effect).toContain("map.resize()");
    expect(effect).toContain("observer.observe(map.getContainer())");
    expect(effect).toContain("observer.observe(sidebar)");
    expect(effect).toContain("observer.observe(panel)");
    expect(effect).toContain("observer.disconnect()");
    expect(effect).toContain("cancelAnimationFrame(frame)");
    expect(effect).not.toMatch(/fitSelectedEntity|panelOpened|fitBounds|flyTo/);
  });
});
