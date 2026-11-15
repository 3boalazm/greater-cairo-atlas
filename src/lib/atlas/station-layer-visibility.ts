import { TRANSIT_MODE_ORDER, type TransitMode } from "./transit-modes";

/**
 * Rail-network reference layers (`public/rail-network*.geojson`) tag every element with
 * `mode: "enr"`, so the ENR transit-mode toggle governs both the reference network and its
 * station symbols. These are the layer ids that carry station symbols/labels.
 */
export const RAIL_REFERENCE_STATION_LAYERS = ["atlas-rail-stations", "atlas-rail-station-labels"] as const;

export type StationLayerGroup = "entity" | "overview" | "rail-reference";

export interface StationLayerVisibilityInput {
  /** Transit modes currently enabled in the layers panel (`النقل` → «وسائل النقل والفلترة»). */
  visibleModes: readonly TransitMode[];
  /** The «المحطات التبادلية» toggle. */
  showInterchanges: boolean;
  /** The `reference` layer group, which owns the OSM rail-network reference layers. */
  showRailReference: boolean;
  /** «إظهار المسارات المهجورة والمحافظة عليها». */
  showDisusedRail?: boolean;
  /** `compact` maps (entity pages, boundary previews) never create the overview/rail layers. */
  compact?: boolean;
}

export interface StationLayerVisibility {
  /** Whether the transit mode filter currently selects any mode at all. */
  anyModeVisible: boolean;
  /** Modes passed to the MapLibre `in` expression for `modes`. */
  modes: TransitMode[];
  /** Interchange rings are hidden entirely when the interchange toggle is off. */
  showInterchangeRings: boolean;
  /** Extra property filter for the rail reference station layers (`rail_status`). */
  railStatuses: string[] | null;
  groups: Record<StationLayerGroup, boolean>;
  /** Per-layer id → visible. Every station layer must appear here. */
  layers: Record<string, boolean>;
}

const ENTITY_STATION_LAYERS = [
  "atlas-station-entity-interchange-ring",
  "atlas-station-entity-icons",
  "atlas-station-entity-labels",
];

const OVERVIEW_STATION_LAYERS = [
  "atlas-transit-interchange-ring",
  "atlas-transit-station-icons",
  "atlas-transit-station-labels",
];

/**
 * Single source of truth for station symbol visibility.
 *
 * FIX D: a station layer may never outlive the filter state of its line/mode. Turning a mode off
 * (or the whole «النقل» group) removes that mode from `modes`, so both the line layers and the
 * station layers resolve to "no match" from the same expression. Keeping this in one pure function
 * makes the line/station pairing testable without a WebGL context.
 */
export function stationLayerVisibility(input: StationLayerVisibilityInput): StationLayerVisibility {
  const requested = [...new Set(input.visibleModes)];
  // Preserve the canonical order so the generated MapLibre expression is deterministic.
  const modes = TRANSIT_MODE_ORDER.filter((mode) => requested.includes(mode));
  const anyModeVisible = modes.length > 0;
  const showInterchangeRings = input.showInterchanges;
  const railStatuses = input.showDisusedRail ? null : ["operational", "under_construction"];
  const groups: Record<StationLayerGroup, boolean> = {
    entity: anyModeVisible,
    overview: anyModeVisible && !input.compact,
    "rail-reference": input.showRailReference && !input.compact && modes.includes("enr"),
  };
  const layers: Record<string, boolean> = {};
  for (const id of ENTITY_STATION_LAYERS) {
    layers[id] = groups.entity && (id.includes("interchange-ring") ? showInterchangeRings : true);
  }
  for (const id of OVERVIEW_STATION_LAYERS) {
    layers[id] = groups.overview && (id.includes("interchange-ring") ? showInterchangeRings : true);
  }
  for (const id of RAIL_REFERENCE_STATION_LAYERS) {
    layers[id] = groups["rail-reference"];
  }
  return { anyModeVisible, modes, showInterchangeRings, railStatuses, groups, layers };
}

/** MapLibre expression that matches station features against the enabled modes. */
export function stationModeFilter(modes: readonly TransitMode[]): unknown[] {
  if (!modes.length) return ["==", ["get", "osm_node_id"], -1];
  return ["any", ...modes.map((mode) => ["in", mode, ["get", "modes"]])];
}

/** Interchange ring expression; an off toggle removes the ring from the same mode filter. */
export function stationRingFilter(modes: readonly TransitMode[], showInterchanges: boolean): unknown[] {
  if (!showInterchanges) return ["==", ["get", "osm_node_id"], -1];
  return ["all", stationModeFilter(modes), ["==", ["get", "interchange"], true]];
}


/** Rail reference station expression: `rail_status` gate only (the mode gate is layer visibility). */
export function railReferenceStationFilter(railStatuses: readonly string[] | null): unknown[] {
  const base: unknown[] = ["all", ["==", ["geometry-type"], "Point"], ["in", ["get", "railway"], ["literal", ["station", "halt"]]]];
  if (!railStatuses) return base;
  return [...base, ["in", ["get", "rail_status"], ["literal", [...railStatuses]]]];
}
