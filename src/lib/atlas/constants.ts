/**
 * Phase 02 metadata and scope definitions for Greater Cairo Atlas.
 *
 * IMPORTANT: No entity records, boundaries, measurements, or operational statuses
 * are fabricated here. Pilot areas below represent the planned ingestion scope
 * for Phase 03+.
 */

export const ATLAS_PHASE = "02-core-schema" as const;

export const HEALTH_PROBE_POINT_WGS84 = {
  longitude: 31.2357,
  latitude: 30.0444,
  srid: 4326,
  note: "Static PostGIS smoke-test point expression in WGS 84 (central Cairo reference); not an ingested database record.",
} as const;

export const PILOT_COVERAGE_AREAS = [
  "New Cairo",
  "Nasr City",
  "Shorouk",
  "Badr",
  "New Administrative Capital",
  "Mostakbal City",
  "Obour",
  "New Obour",
] as const;

export interface EpistemicPrinciple {
  title: string;
  summary: string;
}

export const EPISTEMIC_PRINCIPLES: readonly EpistemicPrinciple[] = [
  {
    title: "Source-Bound Facts",
    summary:
      "Every recorded attribute must retain explicit provenance linking back to a verifiable source record.",
  },
  {
    title: "Side-by-Side Disagreement",
    summary:
      "Conflicting claims or measurements across sources are stored side by side and never silently overwritten.",
  },
  {
    title: "Strict Lifecycle Honesty",
    summary:
      "Planned, announced, or under-construction projects are never represented as operational infrastructure.",
  },
  {
    title: "Spatial Lineage & Open Standards",
    summary:
      "Geometries use WGS 84 (SRID 4326) with GiST indexing, preserving upstream OpenStreetMap type, id, and version.",
  },
] as const;

export const CORE_SCHEMA_TABLES = [
  {
    name: "entities",
    purpose:
      "Canonical urban/geospatial subjects with stable code, Arabic/English names, sector, and strict status enum.",
  },
  {
    name: "facts",
    purpose:
      "Multi-valued assertions with verification_state allowing conflicting claims for the same attribute side by side.",
  },
  {
    name: "evidence",
    purpose:
      "Official, news, dataset, map, or PDF sources linked many-to-many to facts via fact_evidence.",
  },
  {
    name: "features",
    purpose:
      "PostGIS geometries (SRID 4326, GiST indexed) preserving OSM type/id/version and ODbL license lineage.",
  },
] as const;
