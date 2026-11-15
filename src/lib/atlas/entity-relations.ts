import type { EntityRelationSeed, EntitySeed, FactSeed } from "@/lib/atlas/schema";

export interface OsmRouteRelation {
  type: "relation";
  id: number;
  tags?: { route?: string };
  members: Array<{ type: string; ref: number; role: string }>;
}

export interface RelationDerivationResult {
  relations: EntityRelationSeed[];
  unresolved: Array<{ fact_code: string; entity_code: string; attribute: string; value: string; reason: string }>;
  osmRouteRelationsChecked: number;
  osmRouteRelationsMatched: number;
  osmRouteRelationMatchedIds: number[];
  osmRouteRelationsUnmatched: Array<{ relation_id: number; route: string; reason: string }>;
  osmOrdinalsAdded: number;
}

const DIRECT_RELATION_ATTRIBUTES = new Set<EntityRelationSeed["predicate"]>([
  "interchange_with", "part_of", "crosses", "connects", "located_in", "operated_by", "developed_by",
]);
const INACTIVE_STATES = new Set(["superseded", "rejected"]);
const keyOf = (relation: Pick<EntityRelationSeed, "subject_code" | "predicate" | "object_code">) =>
  `${relation.subject_code}\u0000${relation.predicate}\u0000${relation.object_code}`;

/** Build only explicit, entity-to-entity assertions; never use proximity or name similarity. */
export function deriveEntityRelations(entities: readonly EntitySeed[], facts: readonly FactSeed[], osmRelations: readonly OsmRouteRelation[] = []): RelationDerivationResult {
  const entityByCode = new Map(entities.map((entity) => [entity.code, entity]));
  const relations = new Map<string, EntityRelationSeed>();
  const unresolved: RelationDerivationResult["unresolved"] = [];
  const activeFacts = facts.filter((fact) => !INACTIVE_STATES.has(fact.verification_state));
  const lineMemberships = activeFacts.filter((fact) => fact.attribute === "line_membership");
  const lineOrders = activeFacts.filter((fact) => fact.attribute === "line_order");

  for (const membership of lineMemberships) {
    const station = entityByCode.get(membership.entity_code);
    const line = entityByCode.get(membership.value);
    if (!line || line.entity_type !== "transit_line") {
      unresolved.push({ fact_code: membership.code, entity_code: membership.entity_code, attribute: membership.attribute, value: membership.value,
        reason: "line_membership value is not an exact code for an existing transit_line entity" });
      continue;
    }
    if (!station || !["transit_stop", "rail_station", "transit_station"].includes(station.entity_type)) {
      unresolved.push({ fact_code: membership.code, entity_code: membership.entity_code, attribute: membership.attribute, value: membership.value,
        reason: "line membership subject is not an existing station entity" });
      continue;
    }

    const matchingOrders = lineOrders.flatMap((order) => {
      if (order.entity_code !== station.code || !/^\d+$/.test(order.value)) return [];
      const commonEvidence = order.evidence_codes.filter((code) => membership.evidence_codes.includes(code)).sort();
      return commonEvidence.length ? [{ order, evidence: commonEvidence[0]!, ordinal: Number(order.value) }] : [];
    }).sort((a, b) => a.evidence.localeCompare(b.evidence) || a.ordinal - b.ordinal || a.order.code.localeCompare(b.order.code));
    const ordered = matchingOrders[0];
    const relation: EntityRelationSeed = {
      subject_code: line.code,
      predicate: "has_station",
      object_code: station.code,
      ordinal: ordered?.ordinal ?? null,
      valid_as_of: ordered?.order.valid_as_of ?? membership.valid_as_of,
      evidence_ref: ordered?.evidence ?? membership.evidence_codes[0] ?? null,
    };
    const key = keyOf(relation);
    const previous = relations.get(key);
    if (!previous || (previous.ordinal === null && relation.ordinal !== null)) relations.set(key, relation);
  }

  for (const fact of activeFacts) {
    if (!DIRECT_RELATION_ATTRIBUTES.has(fact.attribute as EntityRelationSeed["predicate"])) continue;
    const predicate = fact.attribute as EntityRelationSeed["predicate"];
    if (!entityByCode.has(fact.value)) {
      unresolved.push({ fact_code: fact.code, entity_code: fact.entity_code, attribute: fact.attribute, value: fact.value,
        reason: "relation value is prose or a non-entity identifier; no entity-code relationship was inferred" });
      continue;
    }
    if (!entityByCode.has(fact.entity_code)) continue;
    const relation: EntityRelationSeed = {
      subject_code: fact.entity_code,
      predicate,
      object_code: fact.value,
      ordinal: null,
      valid_as_of: fact.valid_as_of,
      evidence_ref: fact.evidence_codes[0] ?? null,
    };
    relations.set(keyOf(relation), relation);
  }

  // OSM route relations contribute order only when their stop nodes map by exact OSM IDs
  // to existing entities and all mapped stops agree on one fact-backed transit line.
  const osmNodeEntities = new Map<string, Set<string>>();
  for (const fact of activeFacts) if (fact.attribute === "osm_node_id" && entityByCode.has(fact.entity_code)) {
    const codes = osmNodeEntities.get(fact.value) ?? new Set<string>();
    codes.add(fact.entity_code);
    osmNodeEntities.set(fact.value, codes);
  }
  const membershipByStation = new Map<string, FactSeed[]>();
  for (const fact of lineMemberships) membershipByStation.set(fact.entity_code, [...(membershipByStation.get(fact.entity_code) ?? []), fact]);
  const routeRecords = osmRelations.filter((relation) => ["subway", "monorail", "train"].includes(relation.tags?.route ?? ""))
    .slice().sort((a, b) => a.id - b.id);
  const osmOrdinalSourceByRelation = new Map<string, number>();
  let osmRouteRelationsMatched = 0;
  const osmRouteRelationMatchedIds: number[] = [];
  let osmOrdinalsAdded = 0;
  const osmRouteRelationsUnmatched: RelationDerivationResult["osmRouteRelationsUnmatched"] = [];
  for (const route of routeRecords) {
    const stops = route.members.filter((member) => member.type === "node" && ["stop", "stop_entry_only", "stop_exit_only"].includes(member.role));
    const stationLines = stops.map((member) => {
      const stationCodes = osmNodeEntities.get(String(member.ref)) ?? new Set<string>();
      return new Set([...stationCodes].flatMap((stationCode) => (membershipByStation.get(stationCode) ?? [])
        .map((fact) => fact.value).filter((lineCode) => entityByCode.get(lineCode)?.entity_type === "transit_line")));
    });
    if (!stationLines.length || stationLines.some((lines) => lines.size === 0)) {
      osmRouteRelationsUnmatched.push({ relation_id: route.id, route: route.tags?.route ?? "unknown",
        reason: "At least one stop member has no exact entity-code and fact-backed line-membership match." });
      continue;
    }
    const commonLines = [...stationLines[0]!].filter((lineCode) => stationLines.every((lines) => lines.has(lineCode)));
    if (commonLines.length !== 1) {
      osmRouteRelationsUnmatched.push({ relation_id: route.id, route: route.tags?.route ?? "unknown",
        reason: `Mapped stops do not share exactly one fact-backed transit_line (candidate count: ${commonLines.length}).` });
      continue;
    }
    const lineCode = commonLines[0]!;
    osmRouteRelationsMatched++;
    osmRouteRelationMatchedIds.push(route.id);
    let ordinal = 0;
    for (const member of stops) {
      const stationCodes = osmNodeEntities.get(String(member.ref)) ?? new Set<string>();
      const stationCode = [...stationCodes].sort().find((candidate) =>
        (membershipByStation.get(candidate) ?? []).some((fact) => fact.value === lineCode));
      if (!stationCode) continue;
      ordinal++;
      const relation: EntityRelationSeed = { subject_code: lineCode, predicate: "has_station", object_code: stationCode,
        ordinal: null, valid_as_of: null, evidence_ref: null };
      const key = keyOf(relation);
      const existing = relations.get(key);
      if (!existing || existing.ordinal !== null) continue;
      const membershipFact = (membershipByStation.get(stationCode) ?? []).find((fact) => fact.value === lineCode);
      if (!membershipFact?.evidence_codes[0]) continue;
      const previousRouteId = osmOrdinalSourceByRelation.get(key);
      if (previousRouteId !== undefined && previousRouteId <= route.id) continue;
      relations.set(key, { ...existing, ordinal, evidence_ref: existing.evidence_ref ?? membershipFact.evidence_codes[0] });
      osmOrdinalSourceByRelation.set(key, route.id);
      osmOrdinalsAdded++;
    }
  }

  return {
    relations: [...relations.values()].sort((a, b) => a.subject_code.localeCompare(b.subject_code) ||
      a.predicate.localeCompare(b.predicate) || (a.ordinal ?? Number.MAX_SAFE_INTEGER) - (b.ordinal ?? Number.MAX_SAFE_INTEGER) ||
      a.object_code.localeCompare(b.object_code)),
    unresolved: unresolved.sort((a, b) => a.fact_code.localeCompare(b.fact_code)),
    osmRouteRelationsChecked: routeRecords.length,
    osmRouteRelationsMatched,
    osmRouteRelationMatchedIds,
    osmRouteRelationsUnmatched,
    osmOrdinalsAdded,
  };
}

/**
 * BATCH 12.4 — governorate parentage from CAPMAS admin codes.
 *
 * Every read of the COD-AB extract states the governorate each adm2 unit belongs to (`adm1_pcode`,
 * `adm1_ar`, `adm1_en`). This maps those published codes onto the governorate entities that already
 * exist in the seed, so a district/city gets «تابع لمحافظة …» without any geometric guessing and
 * without inventing an entity. A code with no matching entity is reported, never silently linked.
 */
export interface CodabGovernorateRelation {
  entity_code: string;
  relation: "governorate";
  adm1_pcode: string;
  adm1_name_ar: string;
  adm1_name_en: string | null;
  pcodes: string[];
  evidence_code: string;
  source: string;
  license: string;
}

export interface GovernorateDerivationResult {
  relations: EntityRelationSeed[];
  unresolved: Array<{ entity_code: string; adm1_pcode: string; reason: string }>;
}

export function deriveGovernorateRelations(
  codabRelations: readonly CodabGovernorateRelation[],
  entities: ReadonlyArray<{ code: string; entity_type: string }>,
): GovernorateDerivationResult {
  const known = new Set(entities.map((entity) => entity.code));
  const governoratesByCode = new Set(
    entities.filter((entity) => entity.entity_type === "authority" && entity.code.startsWith("AUTH-") && entity.code.endsWith("-GOVERNORATE"))
      .map((entity) => entity.code),
  );
  // adm1 pcode → the seed entity that represents that governorate. Only the three whose authority
  // entity is actually in the seed are mapped; anything else stays unresolved on purpose.
  const expectedGovernorateEntity: Record<string, string> = {
    EG01: "AUTH-CAIRO-GOVERNORATE",
    EG21: "AUTH-GIZA-GOVERNORATE",
    EG14: "AUTH-QALYUBIA-GOVERNORATE",
  };

  const relations: EntityRelationSeed[] = [];
  const unresolved: GovernorateDerivationResult["unresolved"] = [];
  for (const relation of codabRelations) {
    if (relation.relation !== "governorate") continue;
    if (!known.has(relation.entity_code)) {
      unresolved.push({ entity_code: relation.entity_code, adm1_pcode: relation.adm1_pcode, reason: "subject entity is not in the seed" });
      continue;
    }
    const objectCode = expectedGovernorateEntity[relation.adm1_pcode];
    if (!objectCode) {
      unresolved.push({ entity_code: relation.entity_code, adm1_pcode: relation.adm1_pcode, reason: "no governorate entity is mapped for this adm1 pcode" });
      continue;
    }
    if (!governoratesByCode.has(objectCode)) {
      unresolved.push({ entity_code: relation.entity_code, adm1_pcode: relation.adm1_pcode, reason: `governorate entity ${objectCode} is not in the seed` });
      continue;
    }
    if (objectCode === relation.entity_code) {
      unresolved.push({ entity_code: relation.entity_code, adm1_pcode: relation.adm1_pcode, reason: "entity is its own governorate" });
      continue;
    }
    relations.push({
      subject_code: relation.entity_code, predicate: "located_in", object_code: objectCode,
      ordinal: null, valid_as_of: null, evidence_ref: relation.evidence_code,
    });
  }
  return { relations, unresolved };
}

/** The one short simple-panel line: «يتبع: محافظة الجيزة» / "Part of: Giza Governorate". */
export function governorateParentLabel(
  objectNameAr: string,
  objectNameEn: string,
  language: "ar" | "en",
): string {
  return language === "ar" ? `يتبع: ${objectNameAr}` : `Part of: ${objectNameEn}`;
}
