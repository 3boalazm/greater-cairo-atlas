import type { AreaBoundaryFeature } from "./area-boundaries";

export interface BoundsTuple {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface GeometryLike {
  type?: string;
  coordinates?: unknown;
  geometries?: unknown;
}

/**
 * True only for polygonal geometry. Mirrors `SELECTED_AREA_GEOMETRY_FILTER` in
 * `map-selection-filters.ts`: a Polygon/MultiPolygon can be filled, a LineString or Point cannot.
 */
export function isPolygonalGeometry(geometry: unknown): boolean {
  if (!geometry || typeof geometry !== "object") return false;
  const type = (geometry as GeometryLike).type;
  return type === "Polygon" || type === "MultiPolygon";
}

/** True when the boundary is drawable as an area (never a line or point). */
export function hasDrawableBoundary(boundary: AreaBoundaryFeature | null | undefined): boundary is AreaBoundaryFeature {
  return Boolean(boundary && isPolygonalGeometry(boundary.geometry));
}

function visitPositions(geometry: unknown, visit: (position: [number, number]) => void): void {
  if (!geometry || typeof geometry !== "object") return;
  const record = geometry as Record<string, unknown>;
  if (record.type === "GeometryCollection" && Array.isArray(record.geometries)) {
    record.geometries.forEach((child) => visitPositions(child, visit));
    return;
  }
  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      visit([value[0], value[1]]);
      return;
    }
    value.forEach(walk);
  };
  walk(record.coordinates);
}

/** Bounding box of any GeoJSON geometry, or null when it has no finite positions. */
export function boundsOfGeometry(geometry: unknown): BoundsTuple | null {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  visitPositions(geometry, ([longitude, latitude]) => {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  });
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

export function mergeBounds(a: BoundsTuple | null, b: BoundsTuple | null): BoundsTuple | null {
  if (!a) return b;
  if (!b) return a;
  return {
    west: Math.min(a.west, b.west),
    south: Math.min(a.south, b.south),
    east: Math.max(a.east, b.east),
    north: Math.max(a.north, b.north),
  };
}

export interface SelectionFitInput {
  /** Every feature currently drawn for the selected entity. */
  features: ReadonlyArray<{ geometry: unknown }>;
  /** The entity's official (CAPMAS) or OSM boundary, when one exists. */
  boundary: AreaBoundaryFeature | null;
}

export interface SelectionFit {
  bounds: BoundsTuple;
  /** `area` fits the whole boundary; `features` is the point/line-only fallback. */
  target: "area" | "features";
  /** True when the bounds are a single location, so the camera keeps a readable zoom. */
  isPointLike: boolean;
}

/**
 * FIX E — decide what the camera should frame for a selected entity.
 *
 * A selected city/district with a source boundary is framed as its whole area; an entity without a
 * boundary keeps the point behaviour. Boundary first, never a mix of the two, so the map does not
 * zoom into a representative point that sits outside the polygon (e.g. CITY-OBOUR's OSM node is
 * outside the CAPMAS boundary).
 */
export function selectionFit(input: SelectionFitInput): SelectionFit | null {
  if (hasDrawableBoundary(input.boundary)) {
    const bounds = boundsOfGeometry(input.boundary.geometry);
    if (bounds) {
      return {
        bounds,
        target: "area",
        isPointLike: Math.abs(bounds.east - bounds.west) < 0.0005 && Math.abs(bounds.north - bounds.south) < 0.0005,
      };
    }
  }
  const bounds = input.features.reduce<BoundsTuple | null>(
    (merged, feature) => mergeBounds(merged, boundsOfGeometry(feature.geometry)), null,
  );
  if (!bounds) return null;
  return {
    bounds,
    target: "features",
    isPointLike: Math.abs(bounds.east - bounds.west) < 0.0005 && Math.abs(bounds.north - bounds.south) < 0.0005,
  };
}

/**
 * FIX F — researcher-mode note about how complete a drawn line's geometry is.
 *
 * A line assembled from a handful of mostly-unmapped OSM ways must never look like a complete
 * corridor. Only a line the ingest marked as a partial source fragment gets a note; everything else
 * returns null so the panel stays silent instead of inventing a completeness claim.
 */
export function partialGeometryNote(
  entityCode: string | null | undefined,
  completeness: string | null | undefined,
  language: "ar" | "en",
): string | null {
  if (!entityCode || completeness !== "partial_source_geometry") return null;
  if (entityCode === "TRANSIT-BRT") {
    return language === "ar"
      ? "هندسة هذا الخط جزئية: مرسومة من أجزاء طريق مسماة «مسار الاتوبيس الترددي BRT» في OpenStreetMap، ولا تمثل المسار الكامل بعد. المحطات التي لا يوجد لها موقع من مصدر موثّق لا تُرسم."
      : "This line's geometry is partial: it is drawn from OpenStreetMap ways named «مسار الاتوبيس الترددي BRT» and does not yet represent the full corridor. Stations without a source-attested position are not drawn.";
  }
  return language === "ar"
    ? "هندسة هذا الخط جزئية من المصدر المستخدم، ولا تمثل المسار الكامل."
    : "This line's geometry is partial in the source used and does not represent the full corridor.";
}
