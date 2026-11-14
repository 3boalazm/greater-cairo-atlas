"""Create station points from the exact OSM node IDs recorded in canonical seed facts."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from station_matching import (
    _has_explicit_station_mode, _is_construction, _is_station_node, _station_source_quality,
    entity_line_scope, line_mode, station_modes,
)

BBOX = (30.5, 29.2, 32.1, 30.8)
OSM_LICENSE = "ODbL-1.0"
OSM_ATTRIBUTION = "© OpenStreetMap contributors, ODbL 1.0"


def match_station_fact_nodes(
    osm_data: dict[str, Any],
    entities: list[dict[str, str]],
    node_ids_by_entity: dict[str, set[int]],
    line_memberships_by_entity: dict[str, set[str]],
    retrieval_date: str,
    station_groups: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Use fact-linked node IDs as exact identity; never substitute a similar name's geometry.

    When a grouped station extract is available, one representative (the group's primary
    ``osm_node_id``) produces a point for that physical station position. All group IDs must
    already be in the seed facts. Fact-linked rail stations not present in the group report
    receive one deterministic exact-node point as a fallback.
    """
    by_code = {entity["code"]: entity for entity in entities}
    refs: dict[int, set[str]] = defaultdict(set)
    for code, node_ids in node_ids_by_entity.items():
        if code not in by_code or by_code[code].get("entity_type") not in {"transit_stop", "rail_station"}:
            continue
        for node_id in node_ids:
            refs[int(node_id)].add(code)

    elements_by_node: dict[int, dict[str, Any]] = {}
    for element in osm_data.get("elements", []):
        if element.get("type") != "node" or element.get("id") is None:
            continue
        node_id = int(element["id"])
        previous = elements_by_node.get(node_id)
        if previous is None or int(element.get("version", 0) or 0) >= int(previous.get("version", 0) or 0):
            elements_by_node[node_id] = element

    requests: list[dict[str, Any]] = []
    requested_groups: set[tuple[str, int]] = set()
    ambiguous_ids: list[dict[str, Any]] = []
    for group in station_groups or []:
        try:
            node_id = int(group["osm_node_id"])
        except (KeyError, TypeError, ValueError):
            continue
        code_options = sorted(refs.get(node_id, set()))
        if len(code_options) != 1:
            if len(code_options) > 1:
                ambiguous_ids.append({"osm_node_id": node_id, "entity_codes": code_options,
                                     "reason": "one exact node ID is assigned to multiple seed station entities"})
            continue
        code = code_options[0]
        requested_groups.add((code, node_id))
        requests.append({"entity_code": code, "osm_node_id": node_id,
                         "line_codes": sorted(set(group.get("line_codes", []))),
                         "group_id": group.get("feature_id") or f"OSM-NODE-{node_id}",
                         "request_kind": "station_group_primary"})

    # ENR route=train stations and other fact-backed stations outside the five-line station
    # group report still receive a direct point; choose the best exact source node deterministically.
    fallback_codes: list[str] = []
    for code in sorted(node_ids_by_entity):
        if code not in by_code or by_code[code].get("entity_type") not in {"transit_stop", "rail_station"}:
            continue
        if any(request["entity_code"] == code for request in requests):
            continue
        fallback_codes.append(code)
        candidates = [elements_by_node[node_id] for node_id in node_ids_by_entity[code] if node_id in elements_by_node]
        if candidates:
            candidates.sort(key=lambda item: (
                _station_source_quality(item.get("tags", {}) or {}),
                int(item.get("version", 0) or 0),
                -int(item.get("id", 0) or 0),
            ), reverse=True)
            node_id = int(candidates[0]["id"])
            requests.append({"entity_code": code, "osm_node_id": node_id,
                             "line_codes": sorted(line_memberships_by_entity.get(code, set())),
                             "group_id": f"OSM-NODE-{node_id}",
                             "request_kind": "fact_node_fallback"})

    # IDs which have no primary station-group mapping and no fallback are reported, not guessed.
    features: list[dict[str, Any]] = []
    matched: dict[str, list[dict[str, Any]]] = defaultdict(list)
    rejected: dict[str, list[dict[str, Any]]] = defaultdict(list)
    missing_nodes: list[dict[str, Any]] = []
    request_seen: set[tuple[str, int]] = set()

    for request in requests:
        code = request["entity_code"]
        node_id = int(request["osm_node_id"])
        key = (code, node_id)
        if key in request_seen:
            continue
        request_seen.add(key)
        entity = by_code[code]
        element = elements_by_node.get(node_id)
        if element is None:
            missing_nodes.append({**request, "reason": "fact-linked node is absent from the stored OSM extracts"})
            rejected[code].append({"osm_id": node_id, "reason": "fact-linked node is absent from the stored OSM extracts"})
            continue
        tags = element.get("tags", {}) or {}
        status = entity.get("status", "unknown")
        allowed_modes, expected_lines = entity_line_scope(entity)
        source_modes = station_modes(tags, set())
        explicit_mode = _has_explicit_station_mode(tags, set())
        seed_lines = set(line_memberships_by_entity.get(code, set()))
        request_lines = set(request.get("line_codes", []))
        if seed_lines and request_lines and not seed_lines.intersection(request_lines):
            reason = "stored station-group line conflicts with the entity's line_membership facts"
            rejected[code].append({"osm_id": node_id, "reason": reason})
            continue
        constrained_lines = request_lines or seed_lines or (expected_lines or set())
        allowed_modes = set(allowed_modes) | {mode for line in constrained_lines if (mode := line_mode(line)) is not None}
        if not allowed_modes:
            reason = "seed entity and exact station line facts provide no supported transport mode"
            rejected[code].append({"osm_id": node_id, "reason": reason})
            continue
        if expected_lines and constrained_lines and not expected_lines.intersection(constrained_lines):
            reason = "stored line membership conflicts with the entity code's existing station-line guard"
            rejected[code].append({"osm_id": node_id, "reason": reason})
            continue
        if explicit_mode and source_modes and not source_modes.intersection(allowed_modes):
            reason = f"exact OSM node mode {sorted(source_modes)} conflicts with seeded mode scope {sorted(allowed_modes)}"
            rejected[code].append({"osm_id": node_id, "reason": reason})
            continue
        line_modes = {line_mode(line) for line in constrained_lines}
        line_modes.discard(None)
        if explicit_mode and source_modes and line_modes and not source_modes.intersection(line_modes):
            reason = f"exact OSM node mode {sorted(source_modes)} conflicts with line membership modes {sorted(line_modes)}"
            rejected[code].append({"osm_id": node_id, "reason": reason})
            continue
        construction = _is_construction(tags)
        if status in {"operational", "unknown"} and construction:
            reason = "OSM marks this exact node as construction while the seed entity is operational/unknown"
            rejected[code].append({"osm_id": node_id, "reason": reason})
            continue
        if status in {"under_construction", "planned", "approved_planned"}:
            if not construction:
                reason = "seed lifecycle is planned/under-construction but this exact OSM node has no construction tag"
                rejected[code].append({"osm_id": node_id, "reason": reason})
                continue
            reason = "planned/construction feature requires the existing lifecycle alignment checks; no exact-node exception applied"
            rejected[code].append({"osm_id": node_id, "reason": reason})
            continue
        if tags.get("railway") in {"disused", "abandoned", "razed"} or any(tags.get(key) for key in ("disused:railway", "abandoned:railway")):
            reason = "OSM marks this exact node as disused/abandoned"
            rejected[code].append({"osm_id": node_id, "reason": reason})
            continue
        if not _is_station_node(element):
            reason = "fact-linked OSM object is not a tagged station/platform/stop node"
            rejected[code].append({"osm_id": node_id, "reason": reason})
            continue
        lon, lat = element.get("lon"), element.get("lat")
        version = int(element.get("version", 0) or 0)
        if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)) or not (
            BBOX[0] <= float(lon) <= BBOX[2] and BBOX[1] <= float(lat) <= BBOX[3]
        ):
            reason = "exact OSM node lacks a valid point inside the station study bbox"
            rejected[code].append({"osm_id": node_id, "reason": reason})
            continue
        if version < 1:
            reason = "exact OSM station node has no positive version"
            rejected[code].append({"osm_id": node_id, "reason": reason})
            continue
        if code not in refs.get(node_id, set()):
            # Defensive assertion; grouped reports may select only fact-linked representative IDs.
            reason = "selected station-group node ID is not attached to this entity by an osm_node_id fact"
            rejected[code].append({"osm_id": node_id, "reason": reason})
            continue

        line_codes = request.get("line_codes") or sorted(line_memberships_by_entity.get(code, set()))
        feature_code = f"OSM-NODE-{node_id}"
        extra = {
            "entity_type": entity["entity_type"],
            "osm_tags": tags,
            "match_method": "exact osm_node_id fact; no name-based substitution",
            "matched_line_codes": line_codes,
            "station_node_source_quality": _station_source_quality(tags),
            "source_station_modes": sorted({
                mode for mode, keys in (("subway", ("subway",)), ("light_rail", ("light_rail",)),
                                        ("monorail", ("monorail",)), ("train", ("train",)))
                if any(tags.get(key) == "yes" for key in keys)
            }),
        }
        item = {
            "type": "Feature", "id": feature_code,
            "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
            "properties": {
                "code": feature_code, "entity_code": code, "evidence_code": None,
                "srid": 4326, "license": OSM_LICENSE,
                "osm_type": "node", "osm_id": node_id, "osm_version": version,
                "properties": {
                    "source": "OpenStreetMap",
                    "source_ids": {"osm_type": "node", "osm_id": node_id, "osm_version": version},
                    "retrieval_date": retrieval_date, "attribution": OSM_ATTRIBUTION,
                    **extra,
                },
            },
        }
        features.append(item)
        matched[code].append({"osm_id": node_id, "osm_version": version, "group_id": request["group_id"],
                              "line_codes": line_codes, "coordinates": [float(lon), float(lat)],
                              "request_kind": request["request_kind"]})

    unrepresented_ids = []
    for code, node_ids in node_ids_by_entity.items():
        selected = {record["osm_id"] for record in matched.get(code, [])}
        for node_id in sorted(node_ids - selected):
            if (code, node_id) not in request_seen:
                unrepresented_ids.append({"entity_code": code, "osm_node_id": node_id,
                                          "reason": "not selected as a station-group primary node; retained as an alternate node fact"})

    by_line: dict[str, dict[str, Any]] = {}
    for request in requests:
        for line_code in request.get("line_codes", []):
            summary = by_line.setdefault(line_code, {"station_group_count": 0, "matched_group_count": 0,
                                                      "matched_entity_codes": [], "matched_feature_count": 0,
                                                      "rejected_groups": []})
            summary["station_group_count"] += 1
            code = request["entity_code"]
            if any(value["group_id"] == request["group_id"] for value in matched.get(code, [])):
                summary["matched_group_count"] += 1
                summary["matched_entity_codes"].append(code)
                summary["matched_feature_count"] += 1
            else:
                summary["rejected_groups"].append({"entity_code": code, "osm_node_id": request["osm_node_id"]})
    for summary in by_line.values():
        summary["matched_entity_codes"] = sorted(set(summary["matched_entity_codes"]))
        summary["matched_entity_count"] = len(summary["matched_entity_codes"])

    def known_station_mode(code: str) -> str | None:
        memberships = line_memberships_by_entity.get(code, set())
        keys = ("METRO", "LRT", "MONORAIL-EAST", "MONORAIL-WEST", "BRT", "HSR", "ENR", "SUEZ-TRAIN")
        for key in keys:
            if any(key in line for line in memberships):
                return key.casefold().replace("-", "_")
        if code == "STOP-CENTRAL-CAPITAL":
            return "lrt_hsr"
        if code.startswith(("STOP-M1-", "STOP-M2-", "STOP-M3-", "STOP-METRO-")):
            return "metro"
        if code.startswith("STOP-LRT-"):
            return "lrt"
        if code.startswith("STOP-MRE-") or "MONORAIL-MOSHIR" in code:
            return "monorail_east"
        if code.startswith("STOP-MRW-"):
            return "monorail_west"
        if code.startswith("STOP-BRT-"):
            return "brt"
        if code.startswith("STOP-HSR-"):
            return "hsr"
        if code.startswith("RAIL-"):
            return "enr"
        return None

    mode_undetermined = sorted(
        code for code, entity in by_code.items()
        if entity.get("entity_type") in {"transit_stop", "rail_station"}
        and known_station_mode(code) is None
    )
    audit = {
        "method": "exact osm_node_id fact to exact stored OSM node; group primary IDs from the stored station report; no fuzzy fallback", 
        "stations_with_undetermined_mode": mode_undetermined,
        "source_station_entities_with_node_facts": len(node_ids_by_entity),
        "source_node_ids_in_facts": sum(len(ids) for ids in node_ids_by_entity.values()),
        "station_groups_requested": len(requests),
        "station_groups_matched": sum(len(items) for items in matched.values()),
        "station_entities_with_geometry": len(matched),
        "matched_features": len(features),
        "lifecycle_or_geometry_rejections": {code: values for code, values in sorted(rejected.items())},
        "missing_source_nodes": missing_nodes,
        "unrepresented_alternate_node_ids": unrepresented_ids,
        "ambiguous_node_ids": ambiguous_ids,
        "station_entities": {code: {"matched_osm_nodes": values,
                                      "matched_osm_node_ids": [item["osm_id"] for item in values],
                                      "status": by_code[code].get("status")}
                             for code, values in sorted(matched.items())},
        "by_line": by_line,
    }
    return features, audit
