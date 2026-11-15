export const SELECTED_AREA_GEOMETRY_FILTER = [
  "in",
  ["geometry-type"],
  ["literal", ["Polygon", "MultiPolygon"]],
] as const;

export function selectedAreaFilter(entityCode: string | null) {
  return [
    "all",
    ["==", ["get", "entity_code"], entityCode ?? "__none__"],
    SELECTED_AREA_GEOMETRY_FILTER,
  ] as const;
}

/**
 * FIX E — the boundary that backs a selected city/district is drawn from its own source, so the soft
 * highlight does not depend on whether the entity also has a point/line feature in `atlas-features`.
 * Fill and outline are both restricted to polygonal geometry: a line boundary is never filled.
 */
export const SELECTION_BOUNDARY_GEOMETRY_FILTER = SELECTED_AREA_GEOMETRY_FILTER;

/** Selection-boundary layer filter: match everything only while a drawable boundary is attached. */
export function selectionBoundaryFilter(hasBoundary: boolean) {
  return hasBoundary
    ? (["all", SELECTION_BOUNDARY_GEOMETRY_FILTER] as const)
    : (["==", ["get", "entity_code"], "__none__"] as const);
}
