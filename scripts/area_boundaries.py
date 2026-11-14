"""Extract and conservatively match real OSM administrative/place area polygons."""
from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter, defaultdict
from typing import Any

from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, mapping
from shapely.ops import nearest_points, polygonize, unary_union

from road_gap_fill import haversine_km, normalize as normalize_road_label

BOUNDARY_BBOX = (30.2, 28.8, 32.5, 31.0)
OSM_ATTRIBUTION = "© OpenStreetMap contributors, ODbL 1.0"
AREA_TYPES = {"city", "district", "neighborhood", "authority", "governorate"}
PLACE_VALUES = {"city", "town", "suburb", "quarter", "neighbourhood"}
DEFAULT_ADMIN_LEVELS = {
    "city": {"4", "6", "8"},
    "district": {"6", "8", "9", "10"},
    "neighborhood": {"8", "9", "10"},
    "authority": {"4", "6", "8", "9", "10"},
    "governorate": {"4"},
}
AREA_TYPE_ALIASES = {
    "city": {"city"},
    "district": {"district", "neighborhood"},
    "neighborhood": {"neighborhood", "district"},
    "authority": {"authority", "governorate"},
    "governorate": {"governorate", "authority"},
}
GENERIC_AREA_WORDS = {
    "مدينه", "المدينه", "محافظه", "حي", "قسم", "مركز", "مدينه", "الحي",
    "city", "town", "governorate", "district", "neighborhood", "suburb", "quarter",
}


def normalize_area_name(value: str | None) -> str:
    text = unicodedata.normalize("NFKC", value or "").casefold()
    text = text.translate(str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي"}))
    text = "".join(ch for ch in text if unicodedata.category(ch) not in {"Mn", "Cf"})
    tokens = re.findall(r"[\w]+", text, flags=re.UNICODE)
    tokens = [token for token in tokens if token not in GENERIC_AREA_WORDS]
    return "".join(tokens)


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
        polygons = list(polygonize(unary_union(outer_lines)))
        if not polygons:
            return None
        outer = unary_union(polygons)
        if inner_lines:
            holes = list(polygonize(unary_union(inner_lines)))
            if holes:
                outer = outer.difference(unary_union(holes))
        if outer.geom_type == "GeometryCollection":
            polygons = [part for part in outer.geoms if part.geom_type == "Polygon"]
            outer = unary_union(polygons) if polygons else outer
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
            values.extend(part.strip() for part in re.split(r"[;|/]", value) if part.strip())
    return {key for value in values if (key := normalize_area_name(value))}


def _entity_names(entity: dict[str, str]) -> tuple[set[str], set[str]]:
    canonical = {normalize_area_name(entity.get(key)) for key in ("name_ar", "name_en")}
    canonical.discard("")
    aliases_value = entity.get("aliases", "") or ""
    if isinstance(aliases_value, list):
        alias_values = aliases_value
    else:
        alias_values = re.split(r"[|;]", str(aliases_value))
    aliases = {key for value in alias_values if (key := normalize_area_name(value))}
    return canonical, aliases


def _source_priority(kind: str, tags: dict[str, Any]) -> int:
    if kind == "relation" and tags.get("boundary") == "administrative":
        return 0
    if kind == "way" and tags.get("boundary") == "administrative":
        return 1
    if kind == "relation" and tags.get("place") in PLACE_VALUES:
        return 2
    return 3


def _admin_level_priority(entity_type: str, level: str | None) -> int:
    preferred = {
        "city": ["8", "6", "4"],
        "district": ["9", "10", "8", "6"],
        "neighborhood": ["10", "9", "8"],
        "authority": ["4", "6", "8", "9", "10"],
        "governorate": ["4"],
    }.get(entity_type, [])
    try:
        return preferred.index(level) if level in preferred else len(preferred)
    except ValueError:
        return len(preferred)


def _local_bbox(point: list[float], radius_km: float) -> list[float]:
    lon, lat = point
    lon_delta = radius_km / (111.32 * max(0.1, abs(math.cos(math.radians(lat)))))
    lat_delta = radius_km / 110.574
    return [max(BOUNDARY_BBOX[0], lon - lon_delta), max(BOUNDARY_BBOX[1], lat - lat_delta),
            min(BOUNDARY_BBOX[2], lon + lon_delta), min(BOUNDARY_BBOX[3], lat + lat_delta)]


def _area_entity_points(entities: list[dict[str, str]], existing_features: list[dict[str, Any]] | None) -> dict[str, list[list[float]]]:
    allowed = {entity["code"] for entity in entities if entity.get("entity_type") in AREA_TYPES}
    points: dict[str, list[list[float]]] = defaultdict(list)
    for feature in existing_features or []:
        props = feature.get("properties", {})
        code = props.get("entity_code")
        geometry = feature.get("geometry", {})
        if code not in allowed or geometry.get("type") != "Point":
            continue
        coordinates = geometry.get("coordinates")
        if (isinstance(coordinates, list) and len(coordinates) >= 2 and
                all(isinstance(value, (int, float)) for value in coordinates[:2])):
            point = [float(coordinates[0]), float(coordinates[1])]
            if point not in points[code]:
                points[code].append(point)
    return dict(points)


def _point_distance_m(polygon, point: list[float]) -> float:
    probe = Point(point)
    if polygon.covers(probe):
        return 0.0
    nearest = nearest_points(probe, polygon)[1]
    return haversine_km(point, [nearest.x, nearest.y]) * 1000.0


def _name_score(tags: dict[str, Any], entity: dict[str, str]) -> int:
    canonical, aliases = _entity_names(entity)
    primary: set[str] = set()
    secondary: set[str] = set()
    for key in ("name", "name:ar", "name:en"):
        value = tags.get(key)
        if isinstance(value, str):
            primary.update(normalize_area_name(part) for part in re.split(r"[;|/]", value) if part.strip())
    for key in ("official_name", "alt_name", "old_name", "short_name"):
        value = tags.get(key)
        if isinstance(value, str):
            secondary.update(normalize_area_name(part) for part in re.split(r"[;|/]", value) if part.strip())
    if primary & canonical:
        return 3
    if primary & aliases:
        return 2
    return 1 if (primary | secondary) & (canonical | aliases) else 0


def process_osm_boundaries(data: dict[str, Any], entities: list[dict[str, str]], date: str,
                           rules: dict[str, Any] | None = None,
                           existing_features: list[dict[str, Any]] | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return one unambiguous source polygon per area entity after name, type, bbox and point guards."""
    rules = rules or {}
    area_rules = rules.get("area_entity_rules", {})
    by_code = {entity["code"]: entity for entity in entities if entity.get("entity_type") in AREA_TYPES}
    points_by_code = _area_entity_points(entities, existing_features)
    point_radius_km = {"city": 80.0, "district": 35.0, "neighborhood": 20.0,
                       "authority": 80.0, "governorate": 80.0}
    entity_bboxes: dict[str, list[float]] = {}
    name_index: dict[str, set[str]] = defaultdict(set)
    canonical_by_code: dict[str, set[str]] = {}
    aliases_by_code: dict[str, set[str]] = {}
    for code, entity in by_code.items():
        canonical, aliases = _entity_names(entity)
        canonical_by_code[code], aliases_by_code[code] = canonical, aliases
        for name in canonical | aliases:
            name_index[name].add(code)
        configured_bbox = area_rules.get(code, {}).get("bbox_wgs84")
        if configured_bbox:
            entity_bboxes[code] = list(configured_bbox)
        elif points_by_code.get(code):
            entity_bboxes[code] = _local_bbox(points_by_code[code][0], point_radius_km.get(entity.get("entity_type", ""), 35.0))
        else:
            entity_bboxes[code] = list(BOUNDARY_BBOX)

    candidates_by_entity: dict[str, list[dict[str, Any]]] = defaultdict(list)
    audit: list[dict[str, Any]] = []
    examined = 0
    rejected_without_points: Counter[str] = Counter()
    for element in data.get("elements", []):
        kind = element.get("type")
        tags = element.get("tags", {})
        if kind not in {"way", "relation"} or not isinstance(tags, dict):
            continue
        boundary = tags.get("boundary") == "administrative"
        place = tags.get("place") in PLACE_VALUES
        if not (boundary or place):
            continue
        examined += 1
        try:
            osm_id = int(element["id"])
            version = int(element.get("version", 0) or 0)
        except (KeyError, TypeError, ValueError):
            continue
        labels = _labels(tags)
        label_candidates = set().union(*(name_index.get(label, set()) for label in labels)) if labels else set()
        if not label_candidates:
            continue
        if version < 1:
            audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "rejected", "reason": "missing_osm_version",
                          "candidate_entity_codes": sorted(label_candidates)})
            continue
        level = str(tags.get("admin_level", "")) or None
        if boundary and (not level or not level.isdigit() or not 4 <= int(level) <= 10):
            audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "rejected", "reason": "admin_level_outside_requested_4_to_10",
                          "candidate_entity_codes": sorted(label_candidates), "admin_level": level})
            continue
        geometry = _area_polygon(element)
        if geometry is None or geometry.is_empty or geometry.geom_type not in {"Polygon", "MultiPolygon"}:
            audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "rejected", "reason": "no_real_polygon_geometry",
                          "candidate_entity_codes": sorted(label_candidates)})
            continue
        if not geometry.is_valid:
            geometry = geometry.buffer(0)
        if geometry.is_empty or not geometry.is_valid or geometry.geom_type not in {"Polygon", "MultiPolygon"}:
            audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "rejected", "reason": "invalid_polygon",
                          "candidate_entity_codes": sorted(label_candidates)})
            continue

        qualified: list[dict[str, Any]] = []
        rejected_codes: dict[str, str] = {}
        for code in sorted(label_candidates):
            entity = by_code[code]
            permitted_levels = area_rules.get(code, {}).get("admin_levels", DEFAULT_ADMIN_LEVELS.get(entity["entity_type"], set()))
            if boundary and level not in set(map(str, permitted_levels)):
                rejected_codes[code] = "admin_level_not_compatible_with_entity_type"
                continue
            if tags.get("place") in {"city", "town"} and entity["entity_type"] not in AREA_TYPE_ALIASES["city"] | {"authority", "governorate"}:
                rejected_codes[code] = "place_type_not_compatible_with_city_entity"
                continue
            if tags.get("place") in {"suburb", "quarter", "neighbourhood"} and entity["entity_type"] not in {"district", "neighborhood", "authority", "governorate"}:
                rejected_codes[code] = "place_type_not_compatible_with_area_entity"
                continue
            if not points_by_code.get(code):
                rejected_without_points[code] += 1
                rejected_codes[code] = "entity_has_no_existing_point_geometry_for_boundary_validation"
                continue
            bbox = entity_bboxes[code]
            if not box(*bbox).covers(geometry):
                rejected_codes[code] = "polygon_outside_entity_specific_bbox_guard"
                continue
            distances = [_point_distance_m(geometry, point) for point in points_by_code[code]]
            distance_m = min(distances)
            if distance_m > 1000.0:
                rejected_codes[code] = f"polygon_is_{distance_m:.1f}m_from_existing_entity_point_over_1000m_limit"
                continue
            canonical, aliases = canonical_by_code[code], aliases_by_code[code]
            primary_names = {normalize_area_name(tags.get(key)) for key in ("name", "name:ar", "name:en") if tags.get(key)}
            name_strength = 3 if primary_names & canonical else 2 if primary_names & aliases else _name_score(tags, entity)
            source_priority = _source_priority(kind, tags)
            qualified.append({"code": code, "geometry": geometry, "tags": tags, "element": element,
                              "distance_m": distance_m, "bbox": bbox, "name_score": name_strength,
                              "source_priority": source_priority, "admin_level_priority": _admin_level_priority(entity["entity_type"], level),
                              "boundary_kind": "administrative" if boundary else "place"})
        if len(qualified) > 1:
            audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "ambiguous",
                          "labels": sorted(labels), "admin_level": level,
                          "candidate_entity_codes": sorted(candidate["code"] for candidate in qualified),
                          "reason": "name, entity bbox and existing-point proximity leave multiple area entities"})
        elif len(qualified) == 1:
            candidates_by_entity[qualified[0]["code"]].append(qualified[0])
            audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "candidate",
                          "entity_code": qualified[0]["code"], "admin_level": level,
                          "distance_to_existing_point_m": round(qualified[0]["distance_m"], 1),
                          "source_priority": qualified[0]["source_priority"]})
        elif label_candidates:
            audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "rejected",
                          "labels": sorted(labels), "admin_level": level,
                          "candidate_entity_codes": sorted(label_candidates), "rejections": rejected_codes,
                          "reason": "no entity passed admin/place type, source-point distance and entity-bbox guards"})

    selected: list[dict[str, Any]] = []
    matched_by_type: Counter[str] = Counter()
    ambiguous_entities: dict[str, Any] = {}
    unmatched_entities: dict[str, Any] = {}
    for code, entity in sorted(by_code.items()):
        candidates = candidates_by_entity.get(code, [])
        if not candidates:
            reason = "no named polygon passed the point/bbox/type filters"
            if not points_by_code.get(code):
                reason = "entity has no existing point geometry to validate a boundary candidate"
            unmatched_entities[code] = {"entity_type": entity["entity_type"], "reason": reason}
            continue
        best_priority = min((item["source_priority"], item["admin_level_priority"], -item["name_score"]) for item in candidates)
        best = [item for item in candidates if (item["source_priority"], item["admin_level_priority"], -item["name_score"]) == best_priority]
        if len(best) != 1:
            ambiguous_entities[code] = {
                "entity_type": entity["entity_type"],
                "candidate_osm_ids": [{"osm_type": item["element"]["type"], "osm_id": int(item["element"]["id"]),
                                       "admin_level": str(item["tags"].get("admin_level", "")) or None,
                                       "distance_to_point_m": round(item["distance_m"], 1),
                                       "priority": item["source_priority"]} for item in best],
                "reason": "equally prioritized OSM boundary candidates; no geometry selected",
            }
            unmatched_entities[code] = {"entity_type": entity["entity_type"], "reason": "ambiguous_boundary_candidates"}
            continue
        chosen = best[0]
        item, tags = chosen["element"], chosen["tags"]
        kind = item["type"]
        level = str(tags.get("admin_level", "")) or None
        osm_id = int(item["id"])
        version = int(item.get("version", 0) or 0)
        feature_code = f"OSM-BOUNDARY-{kind.upper()}-{osm_id}-{code}"
        source_ids = {"osm_type": kind, "osm_id": osm_id, "osm_version": version}
        props = {
            "role": "boundary", "entity_type": entity["entity_type"],
            "osm_tags": tags, "boundary_kind": chosen["boundary_kind"],
            "admin_level": level, "name": tags.get("name"),
            "name_ar": tags.get("name:ar"), "name_en": tags.get("name:en"),
            "source_ids": source_ids, "source": "OpenStreetMap",
            "attribution": OSM_ATTRIBUTION, "license": "ODbL-1.0", "retrieval_date": date,
            "distance_to_existing_point_m": round(chosen["distance_m"], 1),
            "matching_priority": {"source": chosen["source_priority"], "admin_level": chosen["admin_level_priority"], "name": chosen["name_score"]},
        }
        selected.append({"type": "Feature", "id": feature_code, "geometry": mapping(chosen["geometry"]),
                         "properties": {"code": feature_code, "entity_code": code,
                                        "osm_type": kind, "osm_id": osm_id, "osm_version": version,
                                        "license": "ODbL-1.0", "properties": props}})
        matched_by_type[entity["entity_type"]] += 1
        for lower in candidates:
            if lower is not chosen:
                audit.append({"osm_type": lower["element"]["type"], "osm_id": int(lower["element"]["id"]),
                              "outcome": "superseded", "entity_code": code,
                              "selected_osm_type": kind, "selected_osm_id": osm_id,
                              "reason": "higher-priority boundary candidate selected"})
        audit.append({"osm_type": kind, "osm_id": osm_id, "outcome": "matched", "entity_code": code,
                      "admin_level": level, "distance_to_existing_point_m": round(chosen["distance_m"], 1),
                      "matching_priority": props["matching_priority"], "bbox_wgs84": chosen["bbox"]})

    counts_by_type: dict[str, dict[str, int]] = {}
    for entity_type in sorted({entity["entity_type"] for entity in by_code.values()}):
        total = sum(entity.get("entity_type") == entity_type for entity in by_code.values())
        matched = matched_by_type[entity_type]
        ambiguous = sum(value["entity_type"] == entity_type for value in ambiguous_entities.values())
        counts_by_type[entity_type] = {"entities": total, "matched": matched, "unmatched": total - matched - ambiguous,
                                       "ambiguous": ambiguous}
    return sorted(selected, key=lambda item: item["properties"]["entity_code"]), {
        "matched_count": len(selected), "audit": audit,
        "source": "OpenStreetMap boundary=administrative / place polygons only",
        "attribution": OSM_ATTRIBUTION, "license": "ODbL-1.0",
        "entity_counts_by_type": counts_by_type,
        "matched_entities": sorted(item["properties"]["entity_code"] for item in selected),
        "unmatched_entities": unmatched_entities,
        "ambiguous_entities": ambiguous_entities,
        "entity_bbox_guards_wgs84": entity_bboxes,
        "existing_point_entity_count": len(points_by_code),
        "source_polygon_elements_examined": examined,
        "candidates_passing_entity_guards": sum(len(values) for values in candidates_by_entity.values()),
    }
