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
