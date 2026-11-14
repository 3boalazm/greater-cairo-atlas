"""Conservative OSM station-node matching against seeded transit-stop entities."""
from __future__ import annotations

import math
import re
import unicodedata
from collections import defaultdict
from typing import Any

from shapely import transform as shapely_transform
from shapely.geometry import Point, shape


SUPPORTED_MODES = {"subway", "light_rail", "monorail", "train"}
DESCRIPTOR_TOKENS = {
    "محطه", "مترو", "مونوريل", "station", "stations", "metro", "lrt", "monorail",
    "light", "rail", "line", "interchange", "stop",
}
ARABIC_TRANSLATION = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ة": "ه", "ى": "ي"})


def normalize_station_name(value: str | None) -> str:
    """Normalize Arabic letter variants and remove generic station/mode descriptors."""
    text = unicodedata.normalize("NFKC", value or "").translate(ARABIC_TRANSLATION).casefold()
    text = "".join(char for char in text if not unicodedata.combining(char) and char != "ـ")
    tokens = re.findall(r"[\w]+", text, flags=re.UNICODE)
    return "".join(token for token in tokens if token not in DESCRIPTOR_TOKENS)


def _split_labels(value: Any) -> list[str]:
    if not isinstance(value, str):
        return []
    return [label.strip() for label in re.split(r"[;|/\n]+", value) if label.strip()]


def _labels_for_entity(entity: dict[str, str]) -> set[str]:
    values = [entity.get("name_ar", ""), entity.get("name_en", "")]
    values.extend(_split_labels(entity.get("aliases", "")))
    return {key for value in values if (key := normalize_station_name(value))}


def _osm_labels(tags: dict[str, Any]) -> set[str]:
    values: list[str] = []
    for key in ("name", "name:ar", "name:en", "alt_name", "old_name"):
        values.extend(_split_labels(tags.get(key)))
    return {normalized for value in values if (normalized := normalize_station_name(value))}


def _name_match_score(tags: dict[str, Any], entity: dict[str, str]) -> int:
    canonical = {normalize_station_name(entity.get(key)) for key in ("name_ar", "name_en")}
    canonical.discard("")
    aliases = {normalize_station_name(value) for value in _split_labels(entity.get("aliases", ""))}
    aliases.discard("")
    primary = {normalize_station_name(value) for key in ("name", "name:ar", "name:en")
               for value in _split_labels(tags.get(key))}
    primary.discard("")
    secondary = {normalize_station_name(value) for key in ("alt_name", "old_name")
                 for value in _split_labels(tags.get(key))}
    secondary.discard("")
    if primary & canonical:
        return 3
    if primary & aliases:
        return 2
    return 1 if (primary | secondary) & (canonical | aliases) else 0


def station_modes(tags: dict[str, Any], relation_modes: set[str]) -> set[str]:
    """Read explicit station/rail tags first; use route relation membership only as fallback."""
    modes: set[str] = set()
    station = str(tags.get("station", "")).casefold()
    railway = str(tags.get("railway", "")).casefold()
    if station == "subway" or tags.get("subway") == "yes" or railway == "subway":
        modes.add("subway")
    if station in {"light_rail", "light rail"} or tags.get("light_rail") == "yes" or railway == "light_rail":
        modes.add("light_rail")
    if station == "monorail" or tags.get("monorail") == "yes" or railway == "monorail":
        modes.add("monorail")
    if station == "train":
        modes.add("train")
    if modes:
        return modes
    if relation_modes & SUPPORTED_MODES:
        return relation_modes & SUPPORTED_MODES
    if railway in {"station", "halt"}:
        return {"train"}
    return set()


def _has_explicit_station_mode(tags: dict[str, Any], relation_modes: set[str]) -> bool:
    station = str(tags.get("station", "")).casefold()
    railway = str(tags.get("railway", "")).casefold()
    return (bool(relation_modes & SUPPORTED_MODES) or station in SUPPORTED_MODES or
            railway in {"subway", "light_rail", "monorail"} or
            any(tags.get(key) == "yes" for key in ("subway", "light_rail", "monorail")))


def entity_line_scope(entity: dict[str, str]) -> tuple[set[str], set[str] | None]:
    """Return allowed transport modes and known matched-line constraints for an entity."""
    code = entity["code"]
    prefix_to_line = {
        "STOP-M1-": ("subway", "TRANSIT-METRO-L1"),
        "STOP-M2-": ("subway", "TRANSIT-METRO-L2"),
        "STOP-M3-": ("subway", "TRANSIT-METRO-L3"),
        "STOP-LRT-": ("light_rail", "TRANSIT-LRT"),
        "STOP-MRE-": ("monorail", "TRANSIT-MONORAIL-EAST"),
        "STOP-MONORAIL-": ("monorail", "TRANSIT-MONORAIL-EAST"),
        "STOP-MRW-": ("monorail", "TRANSIT-MONORAIL-WEST"),
        "STOP-HSR-": ("train", None),
    }
    for prefix, (mode, line) in prefix_to_line.items():
        if code.startswith(prefix):
            if line:
                return {mode}, {line}
            line_id = "TRANSIT-HSR-L1" if "SPHINX" in code else "TRANSIT-HSR-L2" if "GIZA" in code else "TRANSIT-HSR-L3"
            return {mode}, {line_id}
    if code == "STOP-SADAT":
        return {"subway"}, {"TRANSIT-METRO-L1", "TRANSIT-METRO-L2"}
    if code == "STOP-KIT-KAT":
        return {"subway"}, {"TRANSIT-METRO-L3"}
    if code == "STOP-DEMERDASH":
        return {"subway"}, {"TRANSIT-METRO-L1"}
    if code in {"STOP-ABBASSIA", "STOP-CAIRO-STADIUM"}:
        return {"subway"}, {"TRANSIT-METRO-L3"}
    if code == "STOP-ADLY-MANSOUR":
        return SUPPORTED_MODES, {"TRANSIT-METRO-L3", "TRANSIT-LRT", "TRANSIT-MONORAIL-EAST"}
    if code == "STOP-ARTS-CULTURE-CITY":
        return {"light_rail", "monorail"}, {"TRANSIT-LRT", "TRANSIT-MONORAIL-EAST"}
    if code.startswith("STOP-BRT-"):
        return set(), set()
    if code.startswith("RAIL-"):
        return {"train"}, None
    return SUPPORTED_MODES, None


def line_mode(line_code: str) -> str | None:
    if line_code.startswith("TRANSIT-METRO-"):
        return "subway"
    if line_code == "TRANSIT-LRT":
        return "light_rail"
    if line_code.startswith("TRANSIT-MONORAIL-"):
        return "monorail"
    if line_code.startswith(("TRANSIT-HSR-", "TRANSIT-SUEZ-TRAIN")):
        return "train"
    return None


def _point_line_distance_m(lon: float, lat: float, geometry) -> float:
    """Project a local point/line neighborhood to meters for the 600 m alignment check."""
    cos_lat = max(0.01, abs(math.cos(math.radians(lat))))
    projected = shapely_transform(geometry, lambda coords: __import__("numpy").column_stack(
        ((coords[:, 0] - lon) * 111320.0 * cos_lat, (coords[:, 1] - lat) * 110574.0)))
    return Point(0.0, 0.0).distance(projected)


def _is_construction(tags: dict[str, Any]) -> bool:
    return str(tags.get("construction", "")).casefold() in {"yes", "station", "railway"} or \
        str(tags.get("railway", "")).casefold() == "construction"


def _is_station_node(element: dict[str, Any]) -> bool:
    if element.get("type") != "node":
        return False
    tags = element.get("tags")
    return isinstance(tags, dict) and (tags.get("public_transport") == "station" or
        tags.get("railway") in {"station", "halt", "construction"})


def match_osm_station_nodes(
    osm_data: dict[str, Any],
    entities: list[dict[str, str]],
    line_features: list[dict[str, Any]],
    retrieval_date: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Match versioned OSM station nodes to seeded entities without inferring ambiguous links."""
    station_entities = [e for e in entities if e.get("entity_type") in {"transit_stop", "rail_station"}
                        and e.get("code", "").startswith(("STOP-", "RAIL-"))]
    name_index: dict[str, set[str]] = defaultdict(set)
    by_code = {e["code"]: e for e in station_entities}
    for entity in station_entities:
        for name in _labels_for_entity(entity):
            name_index[name].add(entity["code"])

    lines: dict[str, list[Any]] = defaultdict(list)
    relation_line_codes: dict[int, str] = {}
    for feature in line_features:
        properties = feature.get("properties", {})
        metadata = properties.get("properties", {})
        line_code = properties.get("entity_code")
        if metadata.get("entity_type") != "transit_line" or not isinstance(line_code, str):
            continue
        try:
            lines[line_code].append(shape(feature["geometry"]))
        except Exception:
            continue
        if properties.get("osm_type") == "relation" and isinstance(properties.get("osm_id"), int):
            relation_line_codes[properties["osm_id"]] = line_code
    line_unions = {}
    for code, geometries in lines.items():
        try:
            from shapely.ops import unary_union
            line_unions[code] = unary_union(geometries)
        except Exception:
            continue

    relation_modes_by_node: dict[int, set[str]] = defaultdict(set)
    relation_lines_by_node: dict[int, set[str]] = defaultdict(set)
    relation_lineage: dict[int, list[int]] = defaultdict(list)
    for relation in osm_data.get("elements", []):
        if relation.get("type") != "relation":
            continue
        mode = str(relation.get("tags", {}).get("route", "")).casefold()
        if mode not in SUPPORTED_MODES:
            continue
        line_code = relation_line_codes.get(int(relation.get("id", 0) or 0))
        for member in relation.get("members", []):
            if member.get("type") != "node" or not isinstance(member.get("ref"), int):
                continue
            node_id = member["ref"]
            relation_modes_by_node[node_id].add(mode)
            if line_code:
                relation_lines_by_node[node_id].add(line_code)
                relation_lineage[node_id].append(int(relation["id"]))

    candidates_by_entity: dict[str, list[dict[str, Any]]] = defaultdict(list)
    rejections_by_entity: dict[str, list[dict[str, Any]]] = defaultdict(list)
    output: list[dict[str, Any]] = []
    node_audit: list[dict[str, Any]] = []
    matching_node_ids: set[int] = set()
    ambiguous_node_ids: set[int] = set()
    rejected_node_ids: set[int] = set()
    examined = 0

    for element in osm_data.get("elements", []):
        if not _is_station_node(element):
            continue
        examined += 1
        tags = element.get("tags", {})
        normalized_labels = _osm_labels(tags)
        name_candidates = set().union(*(name_index.get(label, set()) for label in normalized_labels)) if normalized_labels else set()
        if not name_candidates:
            continue
        node_id = int(element.get("id", 0) or 0)
        relation_modes = relation_modes_by_node.get(node_id, set())
        modes = station_modes(tags, relation_modes)
        construction = _is_construction(tags)
        explicit_mode = _has_explicit_station_mode(tags, relation_modes)
        generic_station = not explicit_mode and _is_station_node(element)
        rejected: dict[str, str] = {}
        qualified: list[str] = []
        qualified_line_codes: dict[str, list[str]] = {}
        qualified_modes: dict[str, set[str]] = {}
        coords = [element.get("lon"), element.get("lat")]
        point_valid = all(isinstance(value, (int, float)) for value in coords)
        for code in sorted(name_candidates):
            entity = by_code[code]
            allowed_modes, expected_lines = entity_line_scope(entity)
            if not allowed_modes:
                rejected[code] = "seed line is outside the supported subway/light_rail/monorail/train node scope"
                continue
            if entity.get("status") in {"operational", "unknown"}:
                if construction:
                    rejected[code] = "OSM marks station as construction but seed status is operational/unknown"
                    continue
            elif entity.get("status") in {"under_construction", "planned", "approved_planned"}:
                if not construction:
                    rejected[code] = "planned/construction entity has no explicit OSM construction tag"
                    continue
            else:
                rejected[code] = f"unsupported station lifecycle status: {entity.get('status')}"
                continue
            if not point_valid or not (30.5 <= float(coords[0]) <= 32.1 and 29.2 <= float(coords[1]) <= 30.8):
                rejected[code] = "station node lacks a valid WGS84 point inside the station study bbox"
                continue
            member_lines = relation_lines_by_node.get(node_id, set())
            if expected_lines is not None and member_lines and not member_lines.intersection(expected_lines):
                rejected[code] = "OSM route-relation membership identifies a different line"
                continue
            if expected_lines is not None:
                candidate_lines = [line for line in expected_lines if line_mode(line) is None or line_mode(line) in allowed_modes]
            else:
                candidate_lines = [line for line in line_unions if line_mode(line) in allowed_modes]
            if explicit_mode and modes:
                candidate_lines = [line for line in candidate_lines if line_mode(line) in modes]
            check_lines = [line for line in candidate_lines if line in line_unions]
            distances = {line: _point_line_distance_m(float(coords[0]), float(coords[1]), line_unions[line])
                         for line in check_lines}
            near_lines = [line for line, distance in distances.items() if distance <= 600.0]
            inferred_modes = {line_mode(line) for line in near_lines if line_mode(line) in allowed_modes}
            mode_fit = (bool(inferred_modes) or allowed_modes == {"train"}) if generic_station else bool(modes & allowed_modes)
            if not mode_fit:
                rejected[code] = "OSM station type does not fit the seeded line; no compatible matched-line geometry supports the generic railway-station tags"
                continue
            if check_lines and not near_lines:
                nearest_distance = min(distances.values())
                rejected[code] = f"station is {nearest_distance:.1f} m from the matched line geometry (limit 600 m)"
                continue
            if entity.get("status") in {"under_construction", "planned", "approved_planned"} and not near_lines:
                rejected[code] = "construction station is not on an available matched official line alignment within 600 m"
                continue
            effective_modes = inferred_modes if generic_station and inferred_modes else modes & allowed_modes
            matched_lines = sorted(near_lines or (member_lines & set(candidate_lines)) or candidate_lines)
            qualified.append(code)
            qualified_line_codes[code] = matched_lines
            qualified_modes[code] = {mode for mode in effective_modes if mode}
        for rejected_code, reason in rejected.items():
            rejections_by_entity[rejected_code].append({"osm_id": node_id, "reason": reason})

        if len(qualified) == 1:
            code = qualified[0]
            entity = by_code[code]
            version = int(element.get("version", 0) or 0)
            if version < 1:
                rejected[code] = "OSM station node has no positive version"
                rejections_by_entity[code].append({"osm_id": node_id, "reason": rejected[code]})
                rejected_node_ids.add(node_id)
                node_audit.append({"osm_id": node_id, "outcome": "unmatched", "candidate_entity_codes": [code],
                                   "source_labels": sorted(normalized_labels), "station_modes": sorted(modes),
                                   "reason": rejected[code]})
                continue
            matched_lines = qualified_line_codes.get(code, [])
            matched_modes = qualified_modes.get(code, set())
            code_feature = f"OSM-NODE-{node_id}"
            extra = {
                "entity_type": entity["entity_type"], "osm_tags": tags,
                "match_method": "exact normalized bilingual station name + compatible OSM station mode + matched-line proximity",
                "matched_line_codes": matched_lines,
                "route_relation_ids": sorted(set(relation_lineage.get(node_id, []))),
                "source_station_modes": sorted(modes), "matched_line_modes": sorted(matched_modes),
            }
            output.append({
                "type": "Feature", "id": code_feature,
                "geometry": {"type": "Point", "coordinates": [float(coords[0]), float(coords[1])]},
                "properties": {
                    "code": code_feature, "entity_code": code, "evidence_code": None, "srid": 4326,
                    "license": "ODbL-1.0", "osm_type": "node", "osm_id": node_id, "osm_version": version,
                    "properties": {
                        "source": "OpenStreetMap",
                        "source_ids": {"osm_type": "node", "osm_id": node_id, "osm_version": version},
                        "retrieval_date": retrieval_date, "attribution": "© OpenStreetMap contributors, ODbL 1.0",
                        **extra,
                    },
                },
            })
            candidates_by_entity[code].append({"osm_id": node_id, "version": version, "labels": sorted(normalized_labels),
                                                "line_codes": matched_lines, "coordinates": [float(coords[0]), float(coords[1])],
                                                "name_match_score": _name_match_score(tags, entity), "construction": construction})
            matching_node_ids.add(node_id)
            node_audit.append({"osm_id": node_id, "outcome": "matched", "candidate_entity_codes": [code],
                               "source_labels": sorted(normalized_labels), "station_modes": sorted(modes),
                               "matched_line_codes": matched_lines})
        elif len(qualified) > 1:
            ambiguous_node_ids.add(node_id)
            for code in qualified:
                rejections_by_entity[code].append({"osm_id": node_id,
                    "reason": "source node remains ambiguous across multiple seeded station entity codes after filters"})
            node_audit.append({"osm_id": node_id, "outcome": "ambiguous", "candidate_entity_codes": qualified,
                               "source_labels": sorted(normalized_labels), "station_modes": sorted(modes),
                               "reason": "multiple seeded station entities remain compatible after name, mode, lifecycle and line checks"})
        else:
            rejected_node_ids.add(node_id)
            node_audit.append({"osm_id": node_id, "outcome": "unmatched", "candidate_entity_codes": sorted(name_candidates),
                               "source_labels": sorted(normalized_labels), "station_modes": sorted(modes),
                               "rejections": rejected})

    # One entity can have multiple same-named OSM objects on different lines/at distant locations.
    # Keep the higher-confidence primary-name match; if equally strong candidates are separated by
    # more than one station-scale radius, report ambiguity instead of choosing an arbitrary node.
    selected_node_ids: set[int] = set()
    entity_conflicts: dict[str, dict[str, Any]] = {}
    audit_by_node = {item["osm_id"]: item for item in node_audit}
    for code, values in candidates_by_entity.items():
        highest_score = max(value["name_match_score"] for value in values)
        top_values = [value for value in values if value["name_match_score"] == highest_score]
        lower_values = [value for value in values if value["name_match_score"] < highest_score]
        for value in lower_values:
            node_id = value["osm_id"]
            rejected_node_ids.add(node_id)
            rejections_by_entity[code].append({"osm_id": node_id,
                "reason": "a stronger OSM primary-name match to the seeded canonical name resolves this alias-only candidate"})
            record = audit_by_node.get(node_id)
            if record:
                record.update({"outcome": "unmatched", "reason": "lower-confidence alias candidate; a stronger canonical-name match exists"})
        distant_pairs = []
        for index, left in enumerate(top_values):
            for right in top_values[index + 1:]:
                lon1, lat1 = left["coordinates"]
                lon2, lat2 = right["coordinates"]
                dlat, dlon = math.radians(lat2-lat1), math.radians(lon2-lon1)
                h = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
                distance_m = 2 * 6371008.8 * math.asin(math.sqrt(h))
                if distance_m > 600:
                    distant_pairs.append({"osm_ids": [left["osm_id"], right["osm_id"]],
                                          "distance_m": round(distance_m, 1),
                                          "line_codes": [left["line_codes"], right["line_codes"]]})
        if distant_pairs:
            entity_conflicts[code] = {"candidate_osm_node_ids": sorted(value["osm_id"] for value in top_values),
                                      "distant_pairs": distant_pairs,
                                      "reason": "equally strong station-name matches are more than 600 m apart; no geometry selected"}
            for value in top_values:
                node_id = value["osm_id"]
                ambiguous_node_ids.add(node_id)
                record = audit_by_node.get(node_id)
                if record:
                    record.update({"outcome": "ambiguous", "reason": entity_conflicts[code]["reason"]})
            rejections_by_entity[code].append(entity_conflicts[code])
        else:
            selected_node_ids.update(value["osm_id"] for value in top_values)

    output = [feature for feature in output if feature.get("properties", {}).get("osm_id") in selected_node_ids]
    matching_node_ids = set(selected_node_ids)

    per_entity: dict[str, dict[str, Any]] = {}
    for code, entity in by_code.items():
        values = [value for value in candidates_by_entity.get(code, []) if value["osm_id"] in selected_node_ids]
        line_scope = entity_line_scope(entity)[1]
        matched_line_codes = sorted({line for value in values for line in value["line_codes"]})
        per_entity[code] = {
            "entity_type": entity["entity_type"], "status": entity.get("status"),
            "station_line": sorted(line_scope) if line_scope is not None else None,
            "matched_line_codes": matched_line_codes,
            "matched_osm_node_ids": sorted(x["osm_id"] for x in values),
            "matched_count": len(values), "outcome": "matched" if values else "unmatched",
            "rejected_candidates": rejections_by_entity.get(code, []) or ([] if values else [{
                "reason": "no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards"
            }]),
        }
    per_line: dict[str, dict[str, Any]] = {}
    for code, entity in by_code.items():
        line_scope = entity_line_scope(entity)[1]
        keys = per_entity[code]["matched_line_codes"] if per_entity[code]["matched_count"] else (sorted(line_scope) if line_scope else [])
        if not keys:
            keys = ["UNSUPPORTED-LINE" if entity_line_scope(entity)[0] == set() else
                    "RAIL-TRAIN" if code.startswith("RAIL-") else "MODE-RESOLVED"]
        for key in keys:
            summary = per_line.setdefault(key, {"station_entities": 0, "matched_entities": 0, "matched_entity_codes": [],
                                                 "unmatched_entities": [], "matched_osm_nodes": 0,
                                                 "station_feature_count_before": 0, "station_feature_count_after": 0})
            summary["station_entities"] += 1
            if per_entity[code]["matched_count"]:
                summary["matched_entities"] += 1
                summary["matched_entity_codes"].append(code)
                summary["matched_osm_nodes"] += per_entity[code]["matched_count"]
            else:
                summary["unmatched_entities"].append(code)

    audit = {
        "source_station_nodes_examined": examined,
        "source_nodes_with_seed_name_candidates": len(node_audit),
        "matched_source_nodes": len(matching_node_ids),
        "ambiguous_source_nodes": len(ambiguous_node_ids),
        "rejected_source_nodes": len(rejected_node_ids),
        "entity_level_ambiguous_entities": len(entity_conflicts),
        "entity_level_conflicts": entity_conflicts,
        "station_entities": per_entity,
        "by_line": per_line,
        "source_node_audit": node_audit,
        "attribution": "© OpenStreetMap contributors, ODbL 1.0",
        "license": "ODbL-1.0",
    }
    return output, audit
