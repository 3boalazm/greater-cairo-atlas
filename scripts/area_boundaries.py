"""Extract and conservatively match real OSM administrative/place area polygons."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from shapely.geometry import LineString, Polygon, box, mapping
from shapely.ops import polygonize, unary_union

from road_gap_fill import normalize as normalize_road_label

BOUNDARY_BBOX = (30.2, 28.8, 32.5, 31.0)
OSM_ATTRIBUTION = "© OpenStreetMap contributors, ODbL 1.0"
AREA_TYPES = {"city", "district", "neighborhood", "authority"}
PLACE_VALUES = {"city", "town", "village", "suburb", "neighbourhood", "quarter", "district", "borough"}
DEFAULT_ADMIN_LEVELS = {
    "city": {"4", "6", "8"},
    "district": {"6", "8", "9", "10"},
    "neighborhood": {"8", "9", "10"},
    "authority": {"4", "6", "8", "9", "10"},
    "development_zone": {"6", "8", "9", "10"},
}


def _coords(geometry: Any) -> list[list[float]]:
    if not isinstance(geometry, list):
        return []
    return [[float(point["lon"]), float(point["lat"])] for point in geometry
            if isinstance(point, dict) and isinstance(point.get("lon"), (int, float))
            and isinstance(point.get("lat"), (int, float))]


def _relation_polygon(element: dict[str, Any]):
    outer_lines: list[LineString] = []
    inner_lines: list[LineString] = []
    for member in element.get("members", []):
        if member.get("type") != "way":
            continue
        coords = _coords(member.get("geometry"))
        if len(coords) < 2:
            continue
        try:
            line = LineString(coords)
        except Exception:
            continue
        (inner_lines if member.get("role") == "inner" else outer_lines).append(line)
    if not outer_lines:
        return None
    try:
        outer_polygons = list(polygonize(unary_union(outer_lines)))
        if not outer_polygons:
            return None
        outer = unary_union(outer_polygons)
        if inner_lines:
            holes = list(polygonize(unary_union(inner_lines)))
            if holes:
                outer = outer.difference(unary_union(holes))
        return outer
    except Exception:
        return None


def _area_polygon(element: dict[str, Any]):
    if element.get("type") == "relation":
        return _relation_polygon(element)
    coords = _coords(element.get("geometry"))
    if len(coords) < 4 or coords[0] != coords[-1]:
        return None
    try:
        return Polygon(coords)
    except Exception:
        return None


def _labels(tags: dict[str, Any]) -> set[str]:
    values: list[str] = []
    for key in ("name", "name:ar", "name:en", "official_name", "alt_name", "old_name", "short_name"):
        value = tags.get(key)
        if isinstance(value, str):
            values.extend(part.strip() for part in value.split(";") if part.strip())
    return {normalize_road_label(value) for value in values if normalize_road_label(value)}


def process_osm_boundaries(data: dict[str, Any], entities: list[dict[str, str]], date: str,
                           rules: dict[str, Any] | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return only valid, versioned OSM polygon features with unambiguous exact name matches."""
    rules = rules or {}
    area_rules = rules.get("area_entity_rules", {})
    by_code = {entity["code"]: entity for entity in entities if entity.get("entity_type") in AREA_TYPES}
    index: dict[str, set[str]] = defaultdict(set)
    for code, entity in by_code.items():
        for value in (entity.get("name_ar", ""), entity.get("name_en", ""), *(entity.get("aliases", "") or "").split("|")):
            key = normalize_road_label(value)
            if key:
                index[key].add(code)

    features: list[dict[str, Any]] = []
    audit: list[dict[str, Any]] = []
    seen: set[tuple[str, int, str]] = set()
    for element in data.get("elements", []):
        kind = element.get("type")
        tags = element.get("tags", {})
        if kind not in {"way", "relation"} or not isinstance(tags, dict):
            continue
        boundary = tags.get("boundary") == "administrative"
        place = tags.get("place") in PLACE_VALUES
        if not (boundary or place):
            continue
        version = int(element.get("version", 0) or 0)
        try:
            osm_id = int(element["id"])
        except (KeyError, TypeError, ValueError):
            continue
        if version < 1:
            audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "rejected", "reason": "missing_osm_version"})
            continue
        geometry = _area_polygon(element)
        if geometry is None or geometry.is_empty or geometry.geom_type not in {"Polygon", "MultiPolygon"}:
            audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "rejected", "reason": "no_real_polygon_geometry"})
            continue
        if not geometry.is_valid:
            geometry = geometry.buffer(0)
        if geometry.is_empty or not geometry.is_valid or geometry.geom_type not in {"Polygon", "MultiPolygon"}:
            audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "rejected", "reason": "invalid_polygon"})
            continue
        matching_codes = set().union(*(index.get(value, set()) for value in _labels(tags)))
        level = str(tags.get("admin_level", ""))
        if boundary and not level.isdigit():
            matching_codes = set()
        elif level:
            matching_codes = {code for code in matching_codes
                              if level in set(map(str, area_rules.get(code, {}).get(
                                  "admin_levels", DEFAULT_ADMIN_LEVELS.get(by_code[code]["entity_type"], set()))))}
        if len(matching_codes) != 1:
            audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "ambiguous" if matching_codes else "unmatched",
                          "labels": sorted(_labels(tags)), "admin_level": level or None,
                          "candidate_entity_codes": sorted(matching_codes)})
            continue
        code = next(iter(matching_codes))
        bbox = area_rules.get(code, {}).get("bbox_wgs84", BOUNDARY_BBOX)
        if not box(*bbox).covers(geometry):
            audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "rejected",
                          "entity_code": code, "reason": "outside_entity_area_bbox", "bbox_wgs84": bbox})
            continue
        key = (kind, osm_id, code)
        if key in seen:
            continue
        seen.add(key)
        entity = by_code[code]
        feature_code = f"OSM-BOUNDARY-{kind.upper()}-{osm_id}-{code}"
        source_ids: dict[str, Any] = {"osm_type": kind, "osm_id": osm_id, "osm_version": version}
        props = {
            "role": "boundary", "entity_type": entity["entity_type"],
            "osm_tags": tags, "boundary_kind": "administrative" if boundary else "place",
            "admin_level": level or None, "name": tags.get("name"),
            "name_ar": tags.get("name:ar"), "name_en": tags.get("name:en"),
            "source_ids": source_ids, "source": "OpenStreetMap",
            "attribution": OSM_ATTRIBUTION, "license": "ODbL-1.0", "retrieval_date": date,
        }
        features.append({"type": "Feature", "id": feature_code, "geometry": mapping(geometry),
                         "properties": {"code": feature_code, "entity_code": code,
                                        "osm_type": kind, "osm_id": osm_id, "osm_version": version,
                                        "license": "ODbL-1.0", "properties": props}})
        audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "matched", "entity_code": code,
                      "admin_level": level or None, "bbox_wgs84": bbox})
    features.sort(key=lambda item: item["properties"]["entity_code"])
    return features, {"matched_count": len(features), "audit": audit,
                      "source": "OpenStreetMap boundary=administrative / place polygons only",
                      "attribution": OSM_ATTRIBUTION, "license": "ODbL-1.0"}
