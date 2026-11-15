import { describe, expect, it } from "vitest";
import { deriveEntityRelations } from "@/lib/atlas/entity-relations";
import { entitySeedSchema, factSeedSchema } from "@/lib/atlas/schema";

const entity = (code: string, entity_type: "transit_line" | "transit_stop") => entitySeedSchema.parse({
  code, name_ar: code, name_en: code, entity_type, sector: "CENTRAL", status: "operational", aliases: [], description: null,
});
const fact = (code: string, entity_code: string, attribute: string, value: string) => factSeedSchema.parse({
  code, entity_code, attribute, value, verification_state: "single_source", evidence_codes: ["EV-TEST"],
});

describe("evidence-backed relation derivation", () => {
  it("derives only exact-code membership relationships and retains linked fact evidence/order", () => {
    const line = entity("TRANSIT-METRO-L1", "transit_line");
    const station = entity("STOP-TEST", "transit_stop");
    const result = deriveEntityRelations([line, station], [
      fact("F-MEMBERSHIP", station.code, "line_membership", line.code),
      fact("F-ORDER", station.code, "line_order", "2"),
      fact("F-CONNECTS", line.code, "connects", "Central district and the river"),
    ]);
    expect(result.relations).toEqual([{
      subject_code: line.code, predicate: "has_station", object_code: station.code,
      ordinal: 2, valid_as_of: null, evidence_ref: "EV-TEST",
    }]);
    expect(result.unresolved).toContainEqual(expect.objectContaining({ fact_code: "F-CONNECTS" }));
    expect(result.relations.every((relation) => relation.evidence_ref !== null)).toBe(true);
  });

  it("uses OSM route order only when exact OSM node IDs resolve to a single fact-backed line", () => {
    const line = entity("TRANSIT-METRO-L1", "transit_line");
    const first = entity("STOP-FIRST", "transit_stop");
    const second = entity("STOP-SECOND", "transit_stop");
    const result = deriveEntityRelations([line, first, second], [
      fact("F-FIRST-MEMBERSHIP", first.code, "line_membership", line.code),
      fact("F-SECOND-MEMBERSHIP", second.code, "line_membership", line.code),
      fact("F-FIRST-OSM", first.code, "osm_node_id", "101"),
      fact("F-SECOND-OSM", second.code, "osm_node_id", "202"),
    ], [{
      type: "relation", id: 421705, tags: { route: "subway" }, members: [
        { type: "node", ref: 101, role: "stop" }, { type: "node", ref: 202, role: "stop" },
      ],
    }]);
    expect(result.osmRouteRelationsMatched).toBe(1);
    expect(result.osmOrdinalsAdded).toBe(2);
    expect(result.relations.filter((relation) => relation.predicate === "has_station").map((relation) => relation.ordinal)).toEqual([1, 2]);
    expect(result.relations.every((relation) => relation.evidence_ref === "EV-TEST")).toBe(true);
  });
});
