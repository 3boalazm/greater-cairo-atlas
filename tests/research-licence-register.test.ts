import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

interface LicenceRegisterRecord {
  id: string;
  license: string;
  status: string;
  export_eligible?: boolean;
}

describe("research licence register", () => {
  it("keeps legacy, third-party, future-only, and software scopes distinct", async () => {
    const register = JSON.parse(await readFile("data/research/LICENSE_REGISTER.json", "utf8")) as {
      schema_version: number;
      policy_effective_date: string;
      records: LicenceRegisterRecord[];
      unresolved: string[];
    };
    expect(register.schema_version).toBe(1);
    expect(register.policy_effective_date).toBe("2026-11-18");
    expect(register.records.length).toBeGreaterThanOrEqual(10);
    expect(new Set(register.records.map((record) => record.id)).size).toBe(register.records.length);

    const byId = new Map(register.records.map((record) => [record.id, record]));
    expect(byId.get("legacy-canonical-research")?.license).toBe("CC-BY-4.0");
    expect(byId.get("osm-geometry")?.license).toBe("ODbL-1.0");
    expect(byId.get("capmas-codab-boundaries")?.license).toBe("CC-BY-IGO");
    expect(byId.get("software-code")?.license).toBe("PolyForm-Noncommercial-1.0.0");

    const future = byId.get("future-original-research");
    expect(future?.license).toBe("CC-BY-NC-4.0");
    expect(future?.status).toBe("future-only-not-yet-enabled");
    expect(future?.export_eligible).toBe(false);
    expect(register.unresolved.length).toBeGreaterThan(0);
  });

  it("does not describe inherited legacy scope as individually audited", async () => {
    const register = JSON.parse(await readFile("data/research/LICENSE_REGISTER.json", "utf8")) as {
      records: LicenceRegisterRecord[];
    };
    const inherited = register.records.filter((record) => record.status === "legacy-policy-inherited");
    expect(inherited.length).toBeGreaterThan(0);
    expect(inherited.every((record) => record.license === "CC-BY-4.0")).toBe(true);
  });
});
