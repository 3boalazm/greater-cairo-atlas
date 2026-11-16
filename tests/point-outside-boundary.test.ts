import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPointOutsideBoundaryFindings, hasPointOutsideBoundary } from "@/lib/atlas/area-boundaries";
import { pointOutsideBoundaryNote } from "@/lib/atlas/point-outside-boundary";

const reportPath = path.resolve(process.cwd(), "data/features/point-outside-boundary-report.json");

interface Report {
  counts: Record<string, number>;
  findings: Array<{
    entity_code: string; point: [number, number]; distance_outside_m: number | null;
    inside_osm_boundary: boolean | null; round_coordinate: boolean; evidence_code: string; license: string;
  }>;
}

const reportPromise = readFile(reportPath, "utf8").then((text) => JSON.parse(text) as Report);

describe("BATCH 12.5 — entities whose point falls outside their official boundary", () => {
  it("reports CITY-OBOUR and the other real findings, without moving any point", async () => {
    const report = await reportPromise;
    const codes = [...new Set(report.findings.map((finding) => finding.entity_code))].sort();
    expect(codes).toEqual(["CITY-OBOUR", "DIST-AIN-SHAMS", "DIST-AMIRIYA", "DIST-BAB-SHAREYA", "DIST-BAHTIM", "DIST-HELIOPOLIS"]);
    expect(report.counts.entities_with_official_boundary).toBe(65);
    expect(report.counts.point_findings).toBe(report.findings.length);

    const obour = report.findings.find((finding) => finding.entity_code === "CITY-OBOUR")!;
    // The exact coordinate the atlas draws; the report must record it, not a corrected one.
    expect(obour.point).toEqual([31.450548, 30.1914]);
    expect(obour.distance_outside_m).toBeGreaterThan(100);
    expect(obour.distance_outside_m).toBeLessThan(200);
    expect(obour.evidence_code).toBe("EV-CODAB-ADMIN-2026");
    expect(obour.license).toContain("CC-BY-IGO");
  });

  it("uses the report as a report: no geometry is corrected automatically", async () => {
    const [report, features] = await Promise.all([
      reportPromise,
      readFile(path.resolve(process.cwd(), "data/features/features.geojson"), "utf8").then((text) => JSON.parse(text) as { features: Array<{ geometry: { type: string; coordinates: unknown } | null; properties: { entity_code: string } }> }),
    ]);
    for (const finding of report.findings) {
      const drawn = features.features.filter((feature) => feature.properties.entity_code === finding.entity_code && feature.geometry?.type === "Point");
      if (!drawn.length) continue;
      // The reported coordinate must still be exactly a point in the dataset: nothing was nudged.
      const coordinates = drawn.map((feature) => (feature.geometry!.coordinates as number[]).slice(0, 2));
      expect(coordinates, finding.entity_code).toContainEqual(finding.point);
    }
  });

  it("distinguishes a source disagreement from a bad coordinate", async () => {
    const report = await reportPromise;
    // BAHTIM is inside the OSM boundary: the two sources disagree rather than the point being wrong.
    const bahtim = report.findings.find((finding) => finding.entity_code === "DIST-BAHTIM")!;
    expect(bahtim.inside_osm_boundary).toBe(true);
    expect(pointOutsideBoundaryNote(bahtim, "ar")).toContain("فرق بين المصدرين");
    expect(pointOutsideBoundaryNote(bahtim, "en")).toContain("source disagreement");

    // HELIOPOLIS is outside both, so it is a plain finding with a measured distance.
    const heliopolis = report.findings.find((finding) => finding.entity_code === "DIST-HELIOPOLIS")!;
    expect(heliopolis.inside_osm_boundary).toBe(false);
    // Not a source disagreement, so the Arabic note must not claim one, and it states a distance.
    expect(pointOutsideBoundaryNote(heliopolis, "ar")).not.toContain("فرق بين المصدرين");
    expect(pointOutsideBoundaryNote(heliopolis, "ar")).toContain("متر");
    expect(pointOutsideBoundaryNote(heliopolis, "en")).toContain("m outside");
    expect(pointOutsideBoundaryNote(heliopolis, "en")).not.toContain("source disagreement");

    // The round placeholder coordinate is flagged as such so it is not mistaken for a survey point.
    expect(report.findings.filter((finding) => finding.round_coordinate).map((finding) => finding.entity_code)).toEqual(["DIST-BAB-SHAREYA"]);
  });

  it("serves the finding to the panel for exactly the affected entities", async () => {
    const findings = await getPointOutsideBoundaryFindings();
    expect(findings.size).toBe(6);
    expect(findings.get("CITY-OBOUR")?.distance_outside_m).toBeGreaterThan(100);
    expect(await hasPointOutsideBoundary("CITY-OBOUR")).toBe(true);
    // A boundary entity that is correctly placed must not be flagged.
    expect(await hasPointOutsideBoundary("DIST-AGOUZA")).toBe(false);
    expect(await hasPointOutsideBoundary("CITY-CAIRO")).toBe(false);
  });
});

describe("BATCH 12.5 — client components never pull Node built-ins into the browser bundle", () => {
  it("keeps the panel's note function out of the node:fs module", async () => {
    // This regression really happened: importing the note from area-boundaries.ts (which reads files)
    // broke `next build` with "does not support external modules (request: node:fs/promises)".
    const panel = await readFile(path.resolve(process.cwd(), "src/components/atlas/EntityPanel.tsx"), "utf8");
    expect(panel).toContain('from "@/lib/atlas/point-outside-boundary"');
    expect(panel).not.toMatch(/from "@\/lib\/atlas\/area-boundaries"/u);
    // "use client" is at the top of the panel; the module it imports must have no Node imports at all.
    expect(panel.startsWith('"use client"')).toBe(true);
    const clientSafe = await readFile(path.resolve(process.cwd(), "src/lib/atlas/point-outside-boundary.ts"), "utf8");
    // Check real import statements, not the explanatory comment that mentions the module name.
    const imports = clientSafe.split("\n").filter((line) => /^\s*import\s/u.test(line));
    expect(imports.join("\n")).not.toMatch(/node:fs|node:path/u);
  });
});
