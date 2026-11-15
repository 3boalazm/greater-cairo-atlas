export interface AtlasEntitySummary {
  code: string;
  name_ar: string;
  name_en: string;
  aliases: string[];
  entity_type: string;
  sector: string;
  status: string;
  has_geometry: boolean;
  has_boundary?: boolean;
}

export interface AtlasEvidenceItem {
  code: string;
  url: string | null;
  publisher: string;
  title: string | null;
  source_type: string;
  published_date: string | null;
  accessed_date: string | null;
}

export interface AtlasEntityFact {
  code: string;
  attribute: string;
  value: string;
  unit: string | null;
  valid_as_of: string | null;
  valid_as_of_precision: "day" | "month" | "year";
  verification_state: string;
  notes: string | null;
  evidence: AtlasEvidenceItem[];
}

export interface AtlasEntityRelation {
  subject_code: string;
  predicate: string;
  object_code: string;
  ordinal: number | null;
  evidence_ref: string | null;
  subject: Pick<AtlasEntitySummary, "code" | "name_ar" | "name_en" | "entity_type" | "status">;
  object: Pick<AtlasEntitySummary, "code" | "name_ar" | "name_en" | "entity_type" | "status">;
}

export interface AtlasEntityNeighbor extends AtlasEntityRelation {
  direction: "previous" | "next";
}

export interface AtlasEntityDetail extends AtlasEntitySummary {
  description: string | null;
  facts: AtlasEntityFact[];
  relations?: AtlasEntityRelation[];
  neighbors?: AtlasEntityNeighbor[];
}

export interface EntityListResponse {
  entities: AtlasEntitySummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface AtlasStatsResponse {
  ok: boolean;
  counts?: {
    entities: number;
    facts: number;
    evidence: number;
    features: number;
    fact_evidence: number;
  };
  error?: { message: string };
}

export interface AtlasFeature {
  type: "Feature";
  id: string;
  geometry: unknown;
  properties: {
    code: string;
    entity_code: string;
    name_ar: string;
    name_en: string;
    type: string;
    status: string;
    license: string;
    attribution: string;
    source: string;
    retrieval_date: string;
    source_ids: unknown;
    modes?: string[];
    line_codes?: string[];
    primary_line_code?: string | null;
    interchange?: boolean;
    timeline_dated?: boolean;
    timeline_verification?: string | null;
    timeline_valid_as_of?: string | null;
  };
}

export interface AtlasTimelineStatusFact {
  entity_code: string;
  attribute: string;
  value: string;
  valid_as_of: string;
  valid_as_of_precision: "day" | "month" | "year";
  verification_state: "candidate" | "single_source" | "corroborated" | "verified" | "disputed" | "rejected" | "superseded";
  fact_code: string;
}

export interface AtlasFeatureCollection {
  type: "FeatureCollection";
  metadata: { data_license: string; geometry_license: string; contact: string };
  features: AtlasFeature[];
}

export type AtlasTheme = "night" | "day";
export type AtlasLanguage = "ar" | "en";

export const ENTITY_TYPES = [
  "city", "district", "neighborhood", "road", "bridge", "interchange", "tunnel",
  "transit_line", "transit_stop", "rail_station", "airport", "project", "authority",
  "landmark", "facility", "waterway", "utility", "transit_station", "bridge_interchange",
  "public_facility", "development_zone",
] as const;
export const SECTORS = ["NORTH", "EAST", "SOUTH", "WEST", "CENTRAL", "REGIONAL"] as const;
export const STATUSES = ["operational", "partial", "under_construction", "planned", "approved_planned", "unknown"] as const;
