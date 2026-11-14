import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("OSM road continuity graph", () => {
  it("uses only eligible real ways, honors the configured limit, and records source provenance", () => {
    const result = spawnSync("python3", ["-m", "unittest", "scripts.test_road_gap_fill", "-v"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.error?.message).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
