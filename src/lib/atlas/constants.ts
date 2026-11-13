/**
 * Phase 01 metadata and scope definitions for Greater Cairo Atlas.
 *
 * IMPORTANT: No entity records, boundaries, measurements, or operational statuses
 * are fabricated here. Pilot areas below represent the planned ingestion scope
 * for later phases only.
 */

export const ATLAS_PHASE = "01-foundation" as const;

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

export const DEFERRED_CORE_TABLES = [
  {
    name: "entities",
    purpose: "Canonical urban/geospatial subjects with lifecycle and type constraints.",
  },
  {
    name: "facts",
    purpose: "Time-aware, multi-valued assertions allowing conflicting claims side by side.",
  },
  {
    name: "evidence",
    purpose: "Bibliographic, archival, official, or OSM provenance backing every fact and geometry.",
  },
  {
    name: "features",
    purpose: "PostGIS geometries (SRID 4326, GiST indexed) preserving OSM type/id/version lineage.",
  },
] as const;
