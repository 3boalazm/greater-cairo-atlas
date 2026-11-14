#!/usr/bin/env python3
"""Derive source-backed transit stations and (when present) rail context from stored OSM extracts.

No seed entities are created or modified. Relation member order is preserved per OSM relation.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data/raw"
OUT_DIR = ROOT / "data/research/osm-stations"
PUBLIC_DIR = ROOT / "public"
BBOX = (30.25, 29.2, 32.4, 30.95)  # west, south, east, north
RAIL_EXTRACT = RAW_DIR / "cairo-osm-rail-2026-11-14.json.gz"

LINE_DEFS = {
    "TRANSIT-METRO-L1": {"mode": "metro", "label_en": "Cairo Metro Line 1", "label_ar": "مترو القاهرة — الخط الأول", "status": "operational", "official_count": 35, "official_count_evidence": "EV-140"},
    "TRANSIT-METRO-L2": {"mode": "metro", "label_en": "Cairo Metro Line 2", "label_ar": "مترو القاهرة — الخط الثاني", "status": "operational", "official_count": 20, "official_count_evidence": "EV-143"},
    "TRANSIT-METRO-L3": {"mode": "metro", "label_en": "Cairo Metro Line 3", "label_ar": "مترو القاهرة — الخط الثالث", "status": "operational", "official_count": 34, "official_count_evidence": "EV-312"},
    "TRANSIT-LRT": {"mode": "lrt", "label_en": "Cairo Light Rail Transit", "label_ar": "القطار الكهربائي الخفيف", "status": "operational", "official_count": 12, "official_count_evidence": "EV-073"},
    "TRANSIT-MONORAIL-EAST": {"mode": "monorail_east", "label_en": "East Nile Monorail", "label_ar": "مونوريل شرق النيل", "status": "operational", "official_count": 22, "official_count_evidence": "EV-050"},
    "TRANSIT-MONORAIL-WEST": {"mode": "monorail_west", "label_en": "West Nile Monorail", "label_ar": "مونوريل غرب النيل", "status": "under_construction", "official_count": None},
    "TRANSIT-METRO-L4": {"mode": "metro_l4", "label_en": "Cairo Metro Line 4", "label_ar": "مترو القاهرة — الخط الرابع", "status": "under_construction", "official_count": None},
    "TRANSIT-HSR-L1": {"mode": "hsr", "label_en": "High-Speed Rail", "label_ar": "القطار الكهربائي السريع", "status": "under_construction", "official_count": None},
}
LINE_COLORS = {
    "TRANSIT-METRO-L1": "#c8202f", "TRANSIT-METRO-L2": "#e2b527", "TRANSIT-METRO-L3": "#08783e",
    "TRANSIT-METRO-L4": "#7355a5", "TRANSIT-LRT": "#b74831", "TRANSIT-MONORAIL-EAST": "#174d9b",
    "TRANSIT-MONORAIL-WEST": "#527da8", "TRANSIT-BRT": "#2477a8", "TRANSIT-ENR": "#925c2c",
    "TRANSIT-HSR-L1": "#343434",
}


def norm(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).casefold()
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.replace("ـ", "")
    return re.sub(r"[^\w]+", "", text, flags=re.UNICODE)


def station_match_keys(value: Any) -> set[str]:
    key = norm(value)
    if not key:
        return set()
    keys = {key}
    for prefix in ("محطة", "station", "metrostation", "metrostn"):
        if key.startswith(prefix) and len(key) > len(prefix):
            keys.add(key[len(prefix):])
    for candidate in list(keys):
        for article in ("ال", "al", "el"):
            if candidate.startswith(article) and len(candidate) > len(article) + 2:
                keys.add(candidate[len(article):])
    return keys


def in_bbox(lon: float, lat: float) -> bool:
    west, south, east, north = BBOX
    return west <= lon <= east and south <= lat <= north


def load_extract(filename: Path) -> dict[str, Any]:
    opener = gzip.open if filename.suffix == ".gz" else open
    with opener(filename, "rt", encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict) or not isinstance(value.get("elements"), list):
        raise ValueError(f"OSM extract must contain an elements array: {filename}")
    return value


def iter_existing_extracts() -> list[Path]:
    # The dedicated rail extract contains the route=subway relations needed to
    # refresh the L1/L2/L3 ordered station sequences as well as rail context.
    return sorted(path for path in RAW_DIR.glob("*.json*") if path.is_file())


def more_complete(old: dict[str, Any] | None, new: dict[str, Any]) -> dict[str, Any]:
    if old is None:
        return new
    old_version, new_version = int(old.get("version", 0) or 0), int(new.get("version", 0) or 0)
    old_score = (old_version, len(old.get("tags", {})), len(old.get("members", [])), len(old.get("geometry", [])))
    new_score = (new_version, len(new.get("tags", {})), len(new.get("members", [])), len(new.get("geometry", [])))
    return new if new_score >= old_score else old


def line_for_relation(tags: dict[str, str]) -> str | None:
    route = tags.get("route", "")
    ref = tags.get("ref", "").strip().upper()
    name = " ".join((tags.get("name", ""), tags.get("name:en", ""), tags.get("name:ar", ""))).casefold()
    if route == "subway" and ref in {"1", "2", "3", "4"}:
        return f"TRANSIT-METRO-L{ref}"
    if route in {"train", "light_rail"} and ref == "LRT":
        return "TRANSIT-LRT"
    if route == "monorail" and ("east nile" in name or "شرق النيل" in name):
        return "TRANSIT-MONORAIL-EAST"
    if route == "monorail" and ("west nile" in name or "غرب النيل" in name):
        return "TRANSIT-MONORAIL-WEST"
    # HSR and other construction routes require explicit OSM construction tagging.
    construction = any("construction" in key.casefold() or value.casefold() in {"construction", "under_construction"}
                       for key, value in tags.items())
    if construction and route in {"train", "subway"}:
        if ref == "4":
            return "TRANSIT-METRO-L4"
        if "high speed" in name or "hsr" in name or "سريع" in name or "القطار الكهربائي السريع" in name:
            return "TRANSIT-HSR-L1"
    return None


def is_under_construction(tags: dict[str, str]) -> bool:
    return any("construction" in key.casefold() or value.casefold() in {"construction", "under_construction"}
               for key, value in tags.items())


def station_from_node(node_id: int, node: dict[str, Any], role: str, relation_id: int | None = None) -> dict[str, Any] | None:
    tags = node.get("tags", {}) or {}
    lat, lon = node.get("lat"), node.get("lon")
    if lat is None or lon is None or not in_bbox(float(lon), float(lat)):
        return None
    return {
        "osm_node_id": int(node_id),
        "osm_node_version": int(node["version"]) if node.get("version") is not None else None,
        "name": tags.get("name"),
        "name_ar": tags.get("name:ar"),
        "name_en": tags.get("name:en"),
        "longitude": float(lon), "latitude": float(lat),
        "member_role": role,
        "source_relation_ids": [int(relation_id)] if relation_id is not None else [],
        "osm_tags": tags,
    }


def load_seed_station_names() -> list[dict[str, Any]]:
    path = ROOT / "data/seed/entities.csv"
    with path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    result = []
    for row in rows:
        if row.get("entity_type") not in {"transit_stop", "rail_station"} and not row.get("code", "").startswith(("STOP-", "RAIL-")):
            continue
        names = [row.get("name_ar", ""), row.get("name_en", ""), row.get("code", "")]
        names.extend(part.strip() for part in (row.get("aliases", "") or "").split("|") if part.strip())
        result.append({"code": row["code"], "names": sorted({key for name in names for key in station_match_keys(name)})})
    return result


def load_feature_node_entity_map() -> dict[int, set[str]]:
    path = ROOT / "data/features/features.geojson"
    if not path.exists():
        return {}
    features = json.loads(path.read_text(encoding="utf-8")).get("features", [])
    result: dict[int, set[str]] = defaultdict(set)
    for feature in features:
        props = feature.get("properties", {})
        entity_code = props.get("entity_code")
        code = props.get("code", feature.get("id", ""))
        match = re.fullmatch(r"OSM-NODE-(\d+)", str(code))
        if match and entity_code:
            result[int(match.group(1))].add(entity_code)
    return result


def resolve_entity_codes(station: dict[str, Any], seed_names: list[dict[str, Any]], direct: dict[int, set[str]]) -> list[dict[str, str]]:
    line_codes = set(station.get("line_codes", []))

    def compatible(code: str) -> bool:
        specific = {
            "STOP-M1-": "TRANSIT-METRO-L1", "STOP-M2-": "TRANSIT-METRO-L2", "STOP-M3-": "TRANSIT-METRO-L3",
            "STOP-LRT-": "TRANSIT-LRT", "STOP-MRE-": "TRANSIT-MONORAIL-EAST", "STOP-MRW-": "TRANSIT-MONORAIL-WEST",
        }
        required = next((line for prefix, line in specific.items() if code.startswith(prefix)), None)
        return required is None or required in line_codes

    node_id = station["osm_node_id"]
    if direct.get(node_id):
        matched = [code for code in sorted(direct[node_id]) if compatible(code)]
        if matched:
            return [{"entity_code": code, "matched_by": "OSM node id"} for code in matched]
    candidates = {name_key for key in ("name", "name_ar", "name_en") for name_key in station_match_keys(station.get(key))}
    matches = [{"entity_code": row["code"], "matched_by": "exact normalized name"}
               for row in seed_names if compatible(row["code"]) and candidates.intersection(row["names"])]
    return matches


def distance_meters(left: dict[str, Any], right: dict[str, Any]) -> float:
    radius = 6_371_000.0
    lat1, lat2 = math.radians(left["latitude"]), math.radians(right["latitude"])
    dlat = lat2 - lat1
    dlon = math.radians(right["longitude"] - left["longitude"])
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.asin(math.sqrt(value))


def station_name_keys(station: dict[str, Any]) -> set[str]:
    return {norm(station.get(field)) for field in ("name", "name_ar", "name_en", "int_name", "alt_name") if norm(station.get(field))}


def station_representative_quality(station: dict[str, Any]) -> int:
    tags = station.get("osm_tags", {}) or {}
    construction = any("construction" in key.casefold() or value.casefold() in {"construction", "under_construction"}
                       for key, value in tags.items())
    if construction:
        return 3
    if tags.get("railway") == "station" or tags.get("public_transport") == "station":
        return 0
    if station.get("member_role") in {"stop", "platform"}:
        return 1
    return 2


def canonical_station_groups(stations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse reverse-relation copies, retaining every contributing OSM node reference."""
    groups: list[dict[str, Any]] = []
    for station in sorted(stations, key=lambda item: (item["primary_mode"], station_representative_quality(item), item["osm_node_id"])):
        names = station_name_keys(station)
        target = None
        for group in groups:
            group_names = station_name_keys(group)
            same_node = station["osm_node_id"] in group.get("osm_node_ids", [])
            close = distance_meters(group, station) <= 350
            same_name = bool(names.intersection(group_names))
            same_line = bool(set(station["line_codes"]).intersection(group["line_codes"]))
            unnamed_near_copy = (not names or not group_names) and same_line and distance_meters(group, station) <= 75
            if same_node or (close and same_name) or unnamed_near_copy:
                target = group
                break
        if target is None:
            target = dict(station)
            target["osm_node_ids"] = [station["osm_node_id"]]
            target["osm_node_versions"] = [station.get("osm_node_version")]
            target["source_relation_ids"] = list(station["source_relation_ids"])
            target["line_codes"] = list(station["line_codes"])
            target["modes"] = list(station["modes"])
            target["existing_entities"] = list(station["existing_entities"])
            groups.append(target)
            continue
        for key in ("name", "name_ar", "name_en"):
            if not target.get(key) and station.get(key):
                target[key] = station[key]
        for field, values in (("osm_node_ids", [station["osm_node_id"]]), ("osm_node_versions", [station.get("osm_node_version")]),
                              ("source_relation_ids", station["source_relation_ids"]), ("line_codes", station["line_codes"]),
                              ("modes", station["modes"])):
            target[field] = sorted(set(target.get(field, []) + values), key=lambda value: (value is None, value))
        existing = {item["entity_code"] for item in target["existing_entities"]}
        target["existing_entities"].extend(item for item in station["existing_entities"] if item["entity_code"] not in existing)
    for group in groups:
        group["line_codes"] = sorted(set(group["line_codes"]))
        group["modes"] = sorted(set(group["modes"]))
        group["interchange"] = len(group["line_codes"]) > 1
        group["status"] = "under_construction" if any(LINE_DEFS.get(code, {}).get("status") == "under_construction" for code in group["line_codes"]) and not any(LINE_DEFS.get(code, {}).get("status") == "operational" for code in group["line_codes"]) else "operational"
    return groups


def append_station(target: dict[str, Any], incoming: dict[str, Any], line_code: str | None) -> None:
    old_version = target.get("osm_node_version")
    new_version = incoming.get("osm_node_version")
    if new_version is not None and (old_version is None or new_version >= old_version):
        for key in ("osm_node_version", "name", "name_ar", "name_en", "longitude", "latitude", "osm_tags"):
            if incoming.get(key) not in (None, ""):
                target[key] = incoming[key]
    if line_code and line_code not in target["line_codes"]:
        target["line_codes"].append(line_code)
    for relation_id in incoming.get("source_relation_ids", []):
        if relation_id not in target["source_relation_ids"]:
            target["source_relation_ids"].append(relation_id)
    if incoming.get("member_role") == "stop" or target.get("member_role") not in {"stop", "platform"}:
        target["member_role"] = incoming.get("member_role")


def create_station_outputs() -> tuple[dict[str, Any], dict[str, Any]]:
    node_elements: dict[int, dict[str, Any]] = {}
    relations: dict[int, dict[str, Any]] = {}
    sources = iter_existing_extracts()
    railway_station_counts_by_source: dict[str, int] = {}
    for source in sources:
        payload = load_extract(source)
        railway_station_counts_by_source[str(source.relative_to(ROOT))] = len({int(element["id"]) for element in payload["elements"] if element.get("type") == "node" and (element.get("tags", {}) or {}).get("railway") == "station"})
        for element in payload["elements"]:
            if element.get("type") == "node":
                node_id = int(element["id"])
                node_elements[node_id] = more_complete(node_elements.get(node_id), element)
            elif element.get("type") == "relation":
                relation_id = int(element["id"])
                relations[relation_id] = more_complete(relations.get(relation_id), element)

    relation_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    all_stations: dict[int, dict[str, Any]] = {}
    route_sequences: list[dict[str, Any]] = []
    enr_relation_groups: list[dict[str, Any]] = []
    for relation_id, relation in sorted(relations.items()):
        tags = relation.get("tags", {}) or {}
        if tags.get("route") == "train" and tags.get("ref", "").upper() != "LRT":
            ordered_enr_stations = []
            for member in relation.get("members", []):
                if member.get("type") != "node" or member.get("role") not in {"stop", "platform"}:
                    continue
                node_id = int(member["ref"])
                node = node_elements.get(node_id)
                if node is None and member.get("lat") is not None and member.get("lon") is not None:
                    node = {"id": node_id, "lat": member["lat"], "lon": member["lon"]}
                if node is None:
                    continue
                station = station_from_node(node_id, node, member.get("role", ""), relation_id)
                if station is not None and any(station.get(key) for key in ("name", "name_ar", "name_en")):
                    station["line_order"] = len(ordered_enr_stations) + 1
                    ordered_enr_stations.append(station)
            if ordered_enr_stations:
                enr_relation_groups.append({
                    "relation_id": relation_id, "relation_version": relation.get("version"),
                    "route_name": tags.get("name"), "route_name_en": tags.get("name:en"),
                    "route_name_ar": tags.get("name:ar"), "route_ref": tags.get("ref"),
                    "ordered_stations": ordered_enr_stations,
                })
        line_code = line_for_relation(tags)
        if not line_code:
            continue
        if line_code not in LINE_DEFS:
            continue
        definition = LINE_DEFS[line_code]
        # Planned route geometries are only included if the OSM relation itself explicitly says construction.
        if definition["status"] == "under_construction" and not is_under_construction(tags):
            continue
        stops: list[dict[str, Any]] = []
        for member in relation.get("members", []):
            role = member.get("role", "")
            if member.get("type") != "node" or role not in {"stop", "platform"}:
                continue
            node_id = int(member["ref"])
            node = node_elements.get(node_id)
            if node is None and member.get("lat") is not None and member.get("lon") is not None:
                node = {"id": node_id, "lat": member["lat"], "lon": member["lon"]}
            if node is None:
                continue
            station = station_from_node(node_id, node, role, relation_id)
            if station is None:
                continue
            stops.append(station)
            if node_id not in all_stations:
                all_stations[node_id] = {**station, "line_codes": [], "source_relation_ids": [], "existing_entities": []}
            append_station(all_stations[node_id], station, line_code)
        if not stops:
            continue
        relation_groups[line_code].append({
            "relation_id": relation_id,
            "relation_version": relation.get("version"),
            "route_name": tags.get("name"),
            "route_name_en": tags.get("name:en"),
            "route_name_ar": tags.get("name:ar"),
            "route_ref": tags.get("ref"),
            "route": tags.get("route"),
            "status": definition["status"],
            "ordered_stations": stops,
        })
        route_sequences.append({"line_code": line_code, "relation_id": relation_id, "ordered_node_ids": [s["osm_node_id"] for s in stops]})

    # Supplement route stop-positions with the nearby operational station object when OSM
    # exposes one separately (e.g. Kit Kat: the route members are construction-tagged stop
    # positions, while node/10099279487 is the operational railway=station object).
    for node_id, node in node_elements.items():
        tags = node.get("tags", {}) or {}
        if tags.get("railway") != "station" or tags.get("subway") != "yes" or is_under_construction(tags):
            continue
        station = station_from_node(node_id, node, "station")
        if station is None or node_id in all_stations:
            continue
        names = station_name_keys(station)
        nearby_lines: set[str] = set()
        for route_station in all_stations.values():
            if not route_station.get("line_codes") or not names.intersection(station_name_keys(route_station)):
                continue
            if distance_meters(station, route_station) <= 100:
                nearby_lines.update(route_station["line_codes"])
        if not nearby_lines:
            continue
        station.update({"line_codes": sorted(nearby_lines), "source_relation_ids": [], "existing_entities": [],
                        "station_location_method": "nearby operational railway=station node matched by exact station name and <=100m to route stop-position"})
        all_stations[node_id] = station

    # Keep unassigned railway station/halt nodes as research context only; only
    # route=train relation membership establishes an ENR route assignment.
    rail_nodes = []
    for node_id, node in node_elements.items():
        tags = node.get("tags", {}) or {}
        if tags.get("railway") not in {"station", "halt"} or tags.get("subway") == "yes" or tags.get("station") == "subway":
            continue
        station = station_from_node(node_id, node, "railway_station")
        if station is not None:
            rail_nodes.append(station)
    seed_names = load_seed_station_names()
    direct_matches = load_feature_node_entity_map()
    for station in all_stations.values():
        station["existing_entities"] = resolve_entity_codes(station, seed_names, direct_matches)
        station["line_codes"] = sorted(set(station["line_codes"]))
        station["source_relation_ids"] = sorted(set(station["source_relation_ids"]))
        station["modes"] = sorted({LINE_DEFS.get(code, {}).get("mode", "enr") for code in station["line_codes"]})
        station["interchange"] = len(station["line_codes"]) > 1
        station["status"] = "under_construction" if any(LINE_DEFS.get(code, {}).get("status") == "under_construction" for code in station["line_codes"]) and not any(LINE_DEFS.get(code, {}).get("status") == "operational" for code in station["line_codes"]) else "operational"
        station["primary_mode"] = next((mode for mode in ("metro", "lrt", "monorail_east", "monorail_west", "brt", "enr", "hsr", "metro_l4") if mode in station["modes"]), "enr")
        station["primary_line_code"] = min(station["line_codes"], key=lambda code: (list(LINE_DEFS).index(code) if code in LINE_DEFS else len(LINE_DEFS), code)) if station["line_codes"] else None

    # Merge reverse-direction relation copies into display stations while preserving each route's original ordered nodes.
    display_stations = canonical_station_groups(list(all_stations.values()))
    for station in display_stations:
        station["primary_mode"] = next((mode for mode in ("metro", "lrt", "monorail_east", "monorail_west", "brt", "enr", "hsr", "metro_l4") if mode in station["modes"]), "enr")
        station["primary_line_code"] = station["line_codes"][0] if station["line_codes"] else None

    # Source node tags used in generated records are intentionally limited to relevant transit keys.
    relevant_tags = {"railway", "public_transport", "subway", "station", "train", "name", "name:ar", "name:en", "alt_name", "int_name", "network", "operator", "gtfs:stop_id", "construction", "construction:railway"}
    for station in all_stations.values():
        station["osm_tags"] = {key: value for key, value in station.get("osm_tags", {}).items() if key in relevant_tags}
        station["primary_mode"] = next((mode for mode in ("metro", "lrt", "monorail_east", "monorail_west", "brt", "enr", "hsr", "metro_l4") if mode in station["modes"]), "enr")
        station["primary_line_code"] = station["line_codes"][0] if station["line_codes"] else None

    lines = []
    for line_code, definition in LINE_DEFS.items():
        group = relation_groups.get(line_code, [])
        # Leave construction lines with no explicit OSM relation out of this derived list.
        if not group and definition["status"] == "under_construction":
            continue
        line_stations = [station for station in display_stations if line_code in station["line_codes"]]
        unique_ids = sorted({node_id for station in line_stations for node_id in station.get("osm_node_ids", [])})
        lines.append({
            "line_code": line_code, **definition,
            "relation_count": len(group), "osm_station_count": len(line_stations), "source_node_reference_count": len(unique_ids),
            "official_count_comparison": ({"official_count": definition["official_count"], "osm_count": len(line_stations), "difference": len(line_stations) - definition["official_count"]} if definition["official_count"] is not None else None),
            "official_count_shortfall": max(0, definition["official_count"] - len(line_stations)) if definition["official_count"] is not None else None,
            "relations": group,
            "stations": line_stations,
        })

    stations_sorted = sorted(display_stations, key=lambda station: (station["primary_mode"], station["line_codes"], station["osm_node_id"]))
    for feature_index, station in enumerate(stations_sorted):
        station["feature_id"] = f"OSM-NODE-{station['osm_node_id']}"
    official_railway_node_count = sum(1 for node in node_elements.values() if (node.get("tags", {}) or {}).get("railway") == "station")
    report = {
        "schema_version": 1,
        "title": "OSM-sourced Cairo transit station research",
        "bbox_wgs84": list(BBOX),
        "source_files": [str(path.relative_to(ROOT)) for path in sources],
        "rail_extract_available": RAIL_EXTRACT.exists(),
        "railway_station_nodes_in_stored_extracts": official_railway_node_count,
        "railway_station_nodes_by_source": railway_station_counts_by_source,
        "railway_station_or_halt_nodes_in_bbox": len(rail_nodes),
        "line_count": len(lines),
        "station_feature_count": len(stations_sorted),
        "interchange_station_count": sum(bool(station["interchange"]) for station in stations_sorted),
        "existing_seed_stop_entity_count": sum(1 for row in seed_names),
        "existing_seed_stop_entities_mapped": sorted({entry["entity_code"] for station in stations_sorted for entry in station["existing_entities"]}),
        "existing_seed_stop_entities_unmatched": sorted({row["code"] for row in seed_names} - {entry["entity_code"] for station in stations_sorted for entry in station["existing_entities"]}),
        "lines": lines,
        "stations": stations_sorted,
        "unassigned_railway_stations": rail_nodes,
        "enr_route_relations": enr_relation_groups,
        "enr_named_station_node_count": len({station["osm_node_id"] for route in enr_relation_groups for station in route["ordered_stations"]}),
        "route_sequences": route_sequences,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "stations_from_osm.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT_DIR / "stations_from_osm.ar.md").write_text(render_arabic_report(report), encoding="utf-8")
    transit_geojson = {
        "type": "FeatureCollection",
        "metadata": {"source": "OpenStreetMap route relations and railway station nodes", "license": "ODbL-1.0", "retrieval_date": "2026-11-14", "source_file": "data/research/osm-stations/stations_from_osm.json"},
        "features": [station_feature(station) for station in stations_sorted],
    }
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    (PUBLIC_DIR / "transit-stations.geojson").write_text(json.dumps(transit_geojson, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return report, {"nodes": node_elements, "relations": relations}


def station_feature(station: dict[str, Any]) -> dict[str, Any]:
    line_codes = station["line_codes"]
    mode = station["primary_mode"]
    # Unmatched OSM stations remain visible as source-context features; only known seed codes can open an entity panel.
    entity_codes = sorted({entry["entity_code"] for entry in station["existing_entities"]})
    return {
        "type": "Feature", "id": station["feature_id"],
        "geometry": {"type": "Point", "coordinates": [station["longitude"], station["latitude"]]},
        "properties": {
            "osm_node_id": station["osm_node_id"], "osm_node_version": station["osm_node_version"],
            "osm_node_ids": station.get("osm_node_ids", [station["osm_node_id"]]),
            "name": station.get("name"), "name_ar": station.get("name_ar"), "name_en": station.get("name_en"),
            "mode": mode, "modes": station["modes"], "line_codes": line_codes,
            "line_color": LINE_COLORS.get(station.get("primary_line_code"), "#677780"),
            "primary_line_code": station.get("primary_line_code"),
            "status": station["status"], "interchange": station["interchange"],
            "entity_codes": entity_codes, "license": "ODbL-1.0",
            "attribution": "© OpenStreetMap contributors, ODbL 1.0",
            "source_relation_ids": station["source_relation_ids"],
            "station_location_method": station.get("station_location_method", "OSM route-relation station node"),
        },
    }


def render_arabic_report(report: dict[str, Any]) -> str:
    lines = [
        "# محطات النقل المستخرجة من علاقات OSM",
        "",
        "هذه قائمة بحثية مستخرجة آليًا من أعضاء علاقات OSM المرتبة (الدور `stop` أو `platform`) ومن عقد المحطات المسجلة. لم تُنشأ كيانات جديدة ولم تُضف محطات إلى seed. اختلافات الأسماء أو العلاقات المتعاكسة محفوظة كما وردت في المصدر.",
        "",
        f"- نطاق الاستخراج WGS84: `{report['bbox_wgs84']}` (غرب، جنوب، شرق، شمال).",
        f"- ملفات OSM المخزنة: {len(report['source_files'])}؛ عقد `railway=station` الفريدة عبرها: {report['railway_station_nodes_in_stored_extracts']}؛ في لقطة الحدود الأحدث: {report['railway_station_nodes_by_source'].get('data/raw/cairo-osm-boundaries-2026-11-14.json.gz', 'غير متاح')} (التقرير السابق ذكر 175)؛ محطات/مواقف سكك داخل النطاق: {report['railway_station_or_halt_nodes_in_bbox']}.",
        f"- محطات فريدة مرسومة بعد دمج تكرار العقد: {report['station_feature_count']}؛ محطات تبادلية حسب عقدة/اسم مطابق: {report['interchange_station_count']}.",
        "- ترخيص هندسة OSM: ODbL 1.0. `node_version` غير متاح لبعض أعضاء العلاقات الذين لم ترد عقدهم منفصلة في اللقطات، ولا يُستنتج أو يُخترع.",
        "",
    ]
    for line in report["lines"]:
        official = line.get("official_count_comparison")
        official_ref = line.get("official_count_evidence")
        official_note = f"المرجع الرسمي المدخل: {official['official_count']} ({official_ref})؛ OSM: {official['osm_count']} (الفارق {official['difference']:+d})" if official else "لا يوجد عدد رسمي واحد مدخل للمقارنة؛ العدد أدناه هو ما ظهر في OSM فقط."
        shortfall = line.get("official_count_shortfall")
        gap_note = f"النقص العددي مقارنة بالمرجع الرسمي: {shortfall}." if shortfall is not None else "لم يُقدّم للخط عدد رسمي مرجعي."
        lines.extend([f"## {line['label_ar']} (`{line['line_code']}`)", "", f"- الحالة: `{line['status']}`؛ علاقات OSM: {line['relation_count']}؛ محطات OSM الفريدة: **{line['osm_station_count']}**. {official_note} {gap_note}", ""])
        if not line["relations"]:
            lines.extend(["لا توجد علاقة مطابقة في ملفات OSM المخزنة.", ""])
            continue
        for route in line["relations"]:
            lines.extend([f"### العلاقة `{route['relation_id']}` — {route.get('route_name_en') or route.get('route_name') or 'بلا اسم إنجليزي'}", "", "| الترتيب | اسم OSM | الاسم العربي | الاسم الإنجليزي | عقدة OSM | الإصدار | الإحداثيات (lon, lat) | تبادل |", "|---:|---|---|---|---:|---:|---|---|"])
            for index, stop in enumerate(route["ordered_stations"], 1):
                interchange = "نعم" if any(item["osm_node_id"] == stop["osm_node_id"] and item["interchange"] for item in report["stations"]) else "لا"
                lines.append(f"| {index} | {stop.get('name') or '—'} | {stop.get('name_ar') or '—'} | {stop.get('name_en') or '—'} | {stop['osm_node_id']} | {stop['osm_node_version'] if stop['osm_node_version'] is not None else 'غير متاح'} | {stop['longitude']:.6f}, {stop['latitude']:.6f} | {interchange} |")
            lines.append("")
    lines.extend(["## مطابقة كيانات المحطات الموجودة في seed", "", f"طابقت القائمة المستخرجة {len(report['existing_seed_stop_entities_mapped'])} كيانًا قائمًا من كيانات `STOP-*` و`RAIL-*` بالاسم المطابق أو بمعرّف عقدة OSM. لا تُنشأ كيانات بديلة.", "", "| كود الكيان القائم |", "|---|"])
    lines.extend(f"| `{code}` |" for code in report["existing_seed_stop_entities_mapped"])
    lines.extend(["", "### كيانات seed غير المطابقة", ""])
    lines.extend(f"- `{code}`" for code in report["existing_seed_stop_entities_unmatched"])
    lines.append("")
    return "\n".join(lines)


def clip_segment(a: tuple[float, float], b: tuple[float, float]) -> tuple[tuple[float, float], tuple[float, float]] | None:
    # Liang-Barsky clipping; input/output coordinates are x=lon,y=lat.
    west, south, east, north = BBOX
    dx, dy = b[0] - a[0], b[1] - a[1]
    p = (-dx, dx, -dy, dy)
    q = (a[0] - west, east - a[0], a[1] - south, north - a[1])
    u0, u1 = 0.0, 1.0
    for pi, qi in zip(p, q):
        if pi == 0:
            if qi < 0:
                return None
            continue
        ratio = qi / pi
        if pi < 0:
            u0 = max(u0, ratio)
        else:
            u1 = min(u1, ratio)
        if u0 > u1:
            return None
    return ((a[0] + u0 * dx, a[1] + u0 * dy), (a[0] + u1 * dx, a[1] + u1 * dy))


def simplify_coordinates(coords: list[list[float]], tolerance_m: float) -> list[list[float]]:
    """Ramer-Douglas-Peucker simplification in local metric coordinates."""
    if len(coords) <= 2 or tolerance_m <= 0:
        return coords
    mean_lat = math.radians(sum(point[1] for point in coords) / len(coords))
    x_scale = 111_320.0 * math.cos(mean_lat)
    y_scale = 110_574.0
    points = [(point[0] * x_scale, point[1] * y_scale) for point in coords]
    keep = {0, len(coords) - 1}
    stack = [(0, len(coords) - 1)]
    tolerance_squared = tolerance_m * tolerance_m
    while stack:
        start, end = stack.pop()
        ax, ay = points[start]
        bx, by = points[end]
        dx, dy = bx - ax, by - ay
        denom = dx * dx + dy * dy
        max_distance = -1.0
        max_index = -1
        for index in range(start + 1, end):
            px, py = points[index]
            if denom == 0:
                distance = (px - ax) ** 2 + (py - ay) ** 2
            else:
                fraction = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / denom))
                distance = (px - (ax + fraction * dx)) ** 2 + (py - (ay + fraction * dy)) ** 2
            if distance > max_distance:
                max_distance, max_index = distance, index
        if max_index >= 0 and max_distance > tolerance_squared:
            keep.add(max_index)
            stack.extend(((start, max_index), (max_index, end)))
    return [coords[index] for index in sorted(keep)]


def derive_rail_context(payload: dict[str, Any], simplify_tolerance_m: float = 100.0, include_station_nodes: bool = True) -> dict[str, Any]:
    elements = payload["elements"]
    nodes: dict[int, dict[str, Any]] = {}
    ways: dict[int, dict[str, Any]] = {}
    relations: list[dict[str, Any]] = []
    for element in elements:
        kind = element.get("type")
        if kind == "node":
            nodes[int(element["id"])] = more_complete(nodes.get(int(element["id"])), element)
        elif kind == "way":
            ways[int(element["id"])] = more_complete(ways.get(int(element["id"])), element)
        elif kind == "relation" and (element.get("tags", {}) or {}).get("route") == "train":
            relations.append(element)
    entity_rows = {}
    with (ROOT / "data/seed/entities.csv").open(encoding="utf-8-sig", newline="") as stream:
        entity_rows = {row["code"]: row for row in csv.DictReader(stream)
                       if row.get("entity_type") == "transit_line" and row["code"].startswith(("TRANSIT-ENR", "TRANSIT-SUEZ-TRAIN"))}
    entity_norms: dict[str, list[str]] = {}
    for code, row in entity_rows.items():
        entity_norms[code] = [norm(row.get("name_en")), norm(row.get("name_ar")), *[norm(x) for x in row.get("aliases", "").split("|")]]

    features = []
    for way_id, way in sorted(ways.items()):
        tags = way.get("tags", {}) or {}
        railway = tags.get("railway")
        construction_type = tags.get("construction") or tags.get("construction:railway")
        if railway not in {"rail", "narrow_gauge", "construction", "disused", "preserved"}:
            continue
        if railway == "construction" and construction_type not in {None, "rail", "narrow_gauge", "light_rail", "subway"}:
            continue
        rail_status = "disused" if railway == "disused" else "preserved" if railway == "preserved" else "under_construction" if railway == "construction" or tags.get("construction:railway") in {"rail", "narrow_gauge"} else "operational"
        coords = []
        for point in way.get("geometry", []) or []:
            if point.get("lon") is not None and point.get("lat") is not None:
                coords.append((float(point["lon"]), float(point["lat"])))
        if not coords:
            for node_id in way.get("nodes", []):
                point = nodes.get(int(node_id), {})
                if point.get("lon") is not None and point.get("lat") is not None:
                    coords.append((float(point["lon"]), float(point["lat"])))
        fragments: list[list[list[float]]] = []
        current: list[list[float]] = []
        for first, second in zip(coords, coords[1:]):
            clipped = clip_segment(first, second)
            if clipped is None:
                if len(current) > 1:
                    fragments.append(current)
                current = []
                continue
            left, right = clipped
            if current and current[-1] == [left[0], left[1]]:
                current.append([right[0], right[1]])
            else:
                if len(current) > 1:
                    fragments.append(current)
                current = [[left[0], left[1]], [right[0], right[1]]]
        if len(current) > 1:
            fragments.append(current)
        fragments = [simplify_coordinates(fragment, simplify_tolerance_m) for fragment in fragments]
        fragments = [fragment for fragment in fragments if len(fragment) > 1]
        if not fragments:
            continue
        code = None
        for relation in relations:
            if any(member.get("type") == "way" and int(member.get("ref", 0)) == way_id for member in relation.get("members", [])):
                tags_r = relation.get("tags", {}) or {}
                candidate = norm(tags_r.get("name:en") or tags_r.get("name"))
                code = next((line_code for line_code, names in entity_norms.items() if candidate and candidate in names), None)
                if code:
                    break
        geometries = [{"type": "LineString", "coordinates": fragment} for fragment in fragments]
        geometry = geometries[0] if len(geometries) == 1 else {"type": "MultiLineString", "coordinates": fragments}
        features.append({"type": "Feature", "id": f"OSM-WAY-{way_id}", "geometry": geometry, "properties": {
            "osm_type": "way", "osm_id": way_id, "osm_version": way.get("version"), "railway": railway,
            "construction": tags.get("construction"), "name": tags.get("name"), "name_en": tags.get("name:en"),
            "entity_code": code, "mode": "enr", "rail_status": rail_status, "license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors, ODbL 1.0",
        }})
    for node_id, node in sorted(nodes.items()):
        if not include_station_nodes:
            continue
        tags = node.get("tags", {}) or {}
        if tags.get("railway") not in {"station", "halt"} or tags.get("train") != "yes":
            continue
        if node.get("lon") is None or node.get("lat") is None or not in_bbox(float(node["lon"]), float(node["lat"])):
            continue
        features.append({"type": "Feature", "id": f"OSM-NODE-{node_id}", "geometry": {"type": "Point", "coordinates": [float(node["lon"]), float(node["lat"])]}, "properties": {
            "osm_type": "node", "osm_id": node_id, "osm_version": node.get("version"), "railway": tags.get("railway"),
            "name": tags.get("name"), "name_ar": tags.get("name:ar"), "name_en": tags.get("name:en"),
            "entity_code": None, "mode": "enr", "rail_status": "disused" if tags.get("railway") == "disused" or tags.get("disused:railway") or tags.get("disused") else "under_construction" if tags.get("railway") == "construction" or tags.get("construction:railway") else "operational", "license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors, ODbL 1.0",
        }})
    features.sort(key=lambda feature: (feature["geometry"]["type"] == "Point", feature["id"]))
    return {"type": "FeatureCollection", "metadata": {"source": str(RAIL_EXTRACT.relative_to(ROOT)), "license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors, ODbL 1.0", "bbox_wgs84": list(BBOX), "feature_count": len(features), "simplification_tolerance_m": simplify_tolerance_m}, "features": features}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rail-extract", type=Path, default=RAIL_EXTRACT, help="optional attached OSM rail extract (JSON or .json.gz)")
    parser.add_argument("--stations-only", action="store_true", help="do not write rail-network.geojson")
    args = parser.parse_args()
    report, _ = create_station_outputs()
    if not args.stations_only:
        rail_source = str(args.rail_extract.relative_to(ROOT)) if args.rail_extract.is_relative_to(ROOT) else args.rail_extract.name
        if args.rail_extract.exists():
            payload = load_extract(args.rail_extract)
            rail = derive_rail_context(payload, simplify_tolerance_m=100.0, include_station_nodes=True)
            detail = derive_rail_context(payload, simplify_tolerance_m=12.0, include_station_nodes=False)
            rail["metadata"]["source"] = rail_source
            detail["metadata"]["source"] = rail_source
            available = len(rail["features"]) > 0
            (PUBLIC_DIR / "rail-network-detail.geojson").write_text(json.dumps(detail, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
            print(f"Rail context ready: {len(rail['features'])} generalized features and {len(detail['features'])} high-zoom ways from {args.rail_extract}")
        else:
            rail = {"type": "FeatureCollection", "metadata": {"source": rail_source, "license": "ODbL-1.0", "bbox_wgs84": list(BBOX), "feature_count": 0}, "features": []}
            available = False
            print(f"Rail extract not attached yet; pipeline ready for {args.rail_extract.relative_to(ROOT) if args.rail_extract.is_relative_to(ROOT) else args.rail_extract}")
        (PUBLIC_DIR / "rail-network.geojson").write_text(json.dumps(rail, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        (PUBLIC_DIR / "rail-network-status.json").write_text(json.dumps({"available": available, "feature_count": len(rail["features"]), "detail_feature_count": len(detail["features"]) if args.rail_extract.exists() else 0, "source": rail_source}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "station_features": report["station_feature_count"],
        "interchanges": report["interchange_station_count"],
        "railway_station_nodes_in_extracts": report["railway_station_nodes_in_stored_extracts"],
        "seed_stop_entities_mapped": len(report["existing_seed_stop_entities_mapped"]),
        "seed_stop_entities_unmatched": len(report["existing_seed_stop_entities_unmatched"]),
        "lines": [{"code": line["line_code"], "relations": line["relation_count"], "stations": line["osm_station_count"], "source_node_refs": line["source_node_reference_count"]} for line in report["lines"]],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
