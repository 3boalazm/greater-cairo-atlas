import { describe, expect, it } from "vitest";
import { statusesAtYear } from "@/lib/atlas/status-timeline";
const row = (entity_code: string, value: string, date: string, verification_state: "verified" | "disputed" | "superseded" | "rejected" = "verified", fact_code = value) => ({
  entity_code, attribute: "operational_status", value, valid_as_of: date, valid_as_of_precision: "year" as const, verification_state, fact_code,
});
describe("dated status snapshots", () => {
  it("uses only the latest eligible dated status on or before the selected year", () => {
    const result = statusesAtYear([row("A", "planned", "2010-01-01"), row("A", "operational", "2020-01-01"), row("B", "operational", "2025-01-01")], 2022);
    expect(result.get("A")?.status).toBe("operational");
    expect(result.has("B")).toBe(false);
  });
  it("retains a disputed verification label when latest claims agree on status", () => {
    const result = statusesAtYear([row("A", "operational", "2020-01-01", "verified"), row("A", "operational", "2020-01-01", "disputed", "disputed")], 2022);
    expect(result.get("A")).toMatchObject({ status: "operational", verification_state: "disputed" });
  });
  it("does not silently resolve conflicting or rejected/superseded claims", () => {
    const result = statusesAtYear([row("A", "planned", "2020-01-01"), row("A", "operational", "2020-01-01", "verified", "other"), row("B", "operational", "2010-01-01", "superseded"), row("C", "planned", "2010-01-01", "rejected")], 2022);
    expect(result.get("A")?.verification_state).toBe("conflicted");
    expect(result.has("B")).toBe(false);
    expect(result.has("C")).toBe(false);
  });
});
