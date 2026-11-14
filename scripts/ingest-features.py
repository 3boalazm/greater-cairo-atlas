#!/usr/bin/env python3
"""Build provenance-preserving GeoJSON features from an explicitly licensed GTFS zip and/or OSM.

This is a local ingestion command only; it is never called from a request handler. No entity is
created. Matches require exact, Unicode-normalized equality against an existing bilingual name or
alias and a compatible entity type. Ambiguous/unmatched source objects are reported, not guessed.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import gzip
import json
import math
import re
import shapely
import sys
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from shapely import make_valid
from shapely.geometry import GeometryCollection, MultiPolygon, Point, Polygon, box, mapping, shape
from shapely.validation import explain_validity
from shapely.ops import nearest_points, unary_union
from shapely.geometry.base import BaseGeometry

from area_boundaries import process_osm_boundaries
from station_matching import match_osm_station_nodes
from road_gap_fill import ROAD_HIGHWAYS, build_road_graph, connect_seed_components, filter_graph_for_entity, haversine_km, normalize as normalize_road_label

ROOT = Path(__file__).resolve().parents[1]
ENTITIES = ROOT / "data/seed/entities.csv"
OUT = ROOT / "data/features"
# Conservative Greater Cairo envelope [west, south, east, north], WGS84.
BBOX = (30.5, 29.2, 32.1, 30.8)
ROAD_BBOX = (30.5, 29.2, 32.35, 30.9)
OSM_ATTRIBUTION = "© OpenStreetMap contributors, ODbL 1.0"
TFC_ATTRIBUTION = "Transport for Cairo (TfC), GTFS for Public Road-Transport, CC BY 4.0"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TFC_PORTAL_URL = "https://portal.transport-data.org/@tfc"


def normalize(value: str | None) -> str:
    text = unicodedata.normalize("NFKC", value or "").casefold()
    return re.sub(r"[^\w]+", "", text, flags=re.UNICODE)


def load_entities() -> list[dict[str, str]]:
    with ENTITIES.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row["aliases"] = row.get("aliases", "") or ""
    return rows


def names(row: dict[str, str]) -> set[str]:
    candidates = [row.get("name_ar", ""), row.get("name_en", "")]
    candidates.extend((row.get("aliases") or "").split("|"))
    return {value for raw in candidates if (value := normalize(raw))}


def matcher(entities: list[dict[str, str]], allowed_types: set[str]):
    index: dict[tuple[str, str], set[str]] = defaultdict(set)
    by_code = {row["code"]: row for row in entities}
    for row in entities:
        if row["entity_type"] in allowed_types:
            for name in names(row):
                index[(row["entity_type"], name)].add(row["code"])
    return index, by_code


def exact_match(index: dict[tuple[str, str], set[str]], entity_type: str, values: list[str]):
    matches: set[str] = set()
    for value in values:
        key = normalize(value)
        if key:
            matches.update(index.get((entity_type, key), set()))
    return sorted(matches)


def in_bbox(geometry: dict[str, Any]) -> bool:
    return geometry_within_bbox(geometry, BBOX)


def geometry_within_bbox(geometry: dict[str, Any], bbox_wgs84: list[float] | tuple[float, ...] | None) -> bool:
    """Check every coordinate against a [west, south, east, north] WGS84 envelope."""
    if bbox_wgs84 is None:
        return True
    if len(bbox_wgs84) != 4:
        return False
    west, south, east, north = bbox_wgs84

    def positions(value: Any):
        if isinstance(value, list) and len(value) >= 2 and all(isinstance(x, (int, float)) for x in value[:2]):
            yield value
        elif isinstance(value, list):
            for item in value:
                yield from positions(item)

    points = list(positions(geometry.get("coordinates", [])))
    return bool(points) and all(west <= point[0] <= east and south <= point[1] <= north for point in points)


def road_bbox_for_entity(entity_code: str, rules: dict[str, Any] | None = None) -> list[float] | tuple[float, ...]:
    rule = (rules or {}).get("entity_rules", {}).get(entity_code, {})
    return rule.get("road_bbox_wgs84", rule.get("bbox_wgs84", ROAD_BBOX))


def road_graph_bbox(rules: dict[str, Any] | None = None) -> tuple[float, float, float, float]:
    bboxes = [ROAD_BBOX]
    for rule in (rules or {}).get("entity_rules", {}).values():
        bbox = rule.get("road_bbox_wgs84")
        if isinstance(bbox, list) and len(bbox) == 4:
            bboxes.append(bbox)
    return (min(bbox[0] for bbox in bboxes), min(bbox[1] for bbox in bboxes),
            max(bbox[2] for bbox in bboxes), max(bbox[3] for bbox in bboxes))


def polygonal_parts(geometry: Any) -> list[Polygon]:
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    if isinstance(geometry, GeometryCollection):
        return [polygon for part in geometry.geoms for polygon in polygonal_parts(part)]
    return []


def validate_feature_geometries(features: list[dict[str, Any]], *, repair: bool,
                                rules: dict[str, Any] | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Apply the PostGIS feature constraint plus the importer's WGS84 bbox/lifecycle assumptions."""
    cairo_bbox = box(BBOX[0], BBOX[1], BBOX[2], BBOX[3])
    accepted: list[dict[str, Any]] = []
    repairs: list[dict[str, Any]] = []
    dropped: list[dict[str, Any]] = []

    def reject(item: dict[str, Any], reason: str, validity_reason: str | None = None) -> None:
        props = item.get("properties", {})
        nested = props.get("properties", {}) if isinstance(props, dict) else {}
        dropped.append({
            "feature_code": props.get("code"),
            "entity_code": props.get("entity_code"),
            "osm_type": props.get("osm_type"),
            "osm_id": props.get("osm_id"),
            "geometry_type": (item.get("geometry") or {}).get("type") if isinstance(item.get("geometry"), dict) else None,
            "category": "invalid geometry",
            "reason": reason,
            "validity_reason": validity_reason,
        })

    for item in features:
        if not isinstance(item, dict):
            dropped.append({"feature_code":None,"entity_code":None,"osm_type":None,"osm_id":None,"geometry_type":None,"category":"invalid geometry","reason":"feature_not_object","validity_reason":None})
            continue
        props = item.get("properties", {})
        if not isinstance(props, dict) or props.get("srid") != 4326:
            reject(item, "srid_must_equal_4326")
            continue
        try:
            geom = shape(item["geometry"])
        except Exception as exc:
            reject(item, f"geometry_parse_error: {exc}")
            continue
        if geom.is_empty:
            reject(item, "empty_geometry")
            continue

        validity_reason = explain_validity(geom)
        if not geom.is_valid:
            original_type = geom.geom_type
            if repair and original_type in {"Polygon", "MultiPolygon"}:
                try:
                    repaired = make_valid(geom)
                    polygons = [part for part in polygonal_parts(repaired) if not part.is_empty]
                    if polygons:
                        candidate = polygons[0] if len(polygons) == 1 else MultiPolygon(polygons)
                        if not candidate.is_valid:
                            candidate = make_valid(candidate)
                            polygons = [part for part in polygonal_parts(candidate) if not part.is_empty]
                            candidate = polygons[0] if len(polygons) == 1 else MultiPolygon(polygons) if polygons else GeometryCollection()
                        if not candidate.is_empty and candidate.is_valid:
                            geom = candidate
                            item["geometry"] = mapping(geom)
                            repairs.append({
                                "feature_code": props.get("code"),
                                "entity_code": props.get("entity_code"),
                                "osm_type": props.get("osm_type"),
                                "osm_id": props.get("osm_id"),
                                "geometry_type_before": original_type,
                                "geometry_type_after": geom.geom_type,
                                "validity_reason_before": validity_reason,
                                "repair": "shapely.make_valid; retained polygonal components only",
                            })
                        else:
                            reject(item, "make_valid_did_not_produce_valid_polygonal_geometry", explain_validity(candidate))
                            continue
                    else:
                        reject(item, "make_valid_produced_no_polygonal_components", validity_reason)
                        continue
                except Exception as exc:
                    reject(item, f"make_valid_failed: {exc}", validity_reason)
                    continue
            else:
                reject(item, "invalid_geometry", validity_reason)
                continue

        # GEOS allows zero-length line strings as valid; reject these before PostGIS import.
        if geom.geom_type in {"LineString", "MultiLineString"}:
            lines = list(geom.geoms) if geom.geom_type == "MultiLineString" else [geom]
            if any(line.is_empty or line.length <= 0 or len(set(line.coords)) < 2 for line in lines):
                reject(item, "degenerate_line", explain_validity(geom))
                continue
        if geom.is_empty:
            reject(item, "empty_geometry_after_repair")
            continue
        nested = props.get("properties", {}) if isinstance(props, dict) else {}
        road_geometry = isinstance(nested, dict) and nested.get("entity_type") == "road"
        entity_code = props.get("entity_code")
        entity_road_bbox = ((rules or {}).get("entity_rules", {}).get(entity_code, {}).get("road_bbox_wgs84")
                            if road_geometry else None)
        accepted_bbox = box(*(entity_road_bbox or (ROAD_BBOX if road_geometry else BBOX)))
        if not accepted_bbox.covers(geom):
            reject(item, "geometry_outside_road_bbox" if road_geometry else "geometry_outside_greater_cairo_bbox")
            continue
        accepted.append(item)

    return accepted, {"repairs": repairs, "dropped": dropped}


def feature(code: str, entity: dict[str, str], geometry: dict[str, Any], license_id: str,
            attribution: str, source: str, source_ids: dict[str, Any], retrieval_date: str,
            extra: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "type": "Feature", "id": code, "geometry": geometry,
        "properties": {
            "code": code, "entity_code": entity["code"], "evidence_code": None,
            "srid": 4326, "license": license_id,
            "osm_type": source_ids.get("osm_type"), "osm_id": source_ids.get("osm_id"),
            "osm_version": source_ids.get("osm_version"),
            "properties": {
                "source": source, "source_ids": source_ids,
                "retrieval_date": retrieval_date, "attribution": attribution,
                **(extra or {}),
            },
        },
    }


def add_candidate(report: dict[str, Any], kind: str, source_id: str, source_name: str,
                  outcome: str, candidates: list[str], reason: str | None = None):
    if kind == "transit_station":
        kind = "transit_stop"
    report["by_type"][kind][outcome] += 1
    record = {"source_id": source_id, "source_name": source_name,
              "entity_type": kind, "candidate_entity_codes": candidates,
              "outcome": outcome, "reason": reason or outcome}
    report.setdefault("_outcomes", []).append(record)
    if outcome != "matched":
        report["unmatched" if outcome == "unmatched" else "ambiguous"].append(record.copy())


def process_gtfs(zip_path: Path, entities: list[dict[str, str]], date: str,
                 license_arg: str | None, license_evidence_url: str | None,
                 report: dict[str, Any]) -> list[dict[str, Any]]:
    if license_arg != "CC-BY-4.0":
        raise ValueError("GTFS license was not verified as CC-BY-4.0. Pass --gtfs-license CC-BY-4.0 only for the permitted Transport Data Commons TfC release. NC data is never accepted.")
    if not license_evidence_url or not license_evidence_url.startswith("https://portal.transport-data.org/"):
        raise ValueError("Provide the exact Transport Data Commons dataset/license page using --gtfs-license-evidence-url; the general portal home page is not sufficient.")
    idx, by_code = matcher(entities, {"transit_line", "transit_stop", "transit_station", "rail_station"})
    out: list[dict[str, Any]] = []
    with zipfile.ZipFile(zip_path) as zf:
        available = {Path(n).name: n for n in zf.namelist() if not n.endswith("/")}
        def table(filename: str):
            entry = available.get(filename)
            if not entry:
                return []
            with zf.open(entry) as f:
                return list(csv.DictReader(line.decode("utf-8-sig") for line in f))
        routes = table("routes.txt")
        trips = table("trips.txt")
        shape_routes: dict[str, set[str]] = defaultdict(set)
        route_by_id = {r.get("route_id", ""): r for r in routes}
        for trip in trips:
            if trip.get("shape_id") and trip.get("route_id"):
                shape_routes[trip["shape_id"]].add(trip["route_id"])
        points: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
        for row in table("shapes.txt"):
            try:
                points[row["shape_id"]].append((int(row["shape_pt_sequence"]), float(row["shape_pt_lon"]), float(row["shape_pt_lat"])))
            except (KeyError, ValueError):
                continue
        for shape_id, sequence in sorted(points.items()):
            route_rows = [route_by_id[rid] for rid in sorted(shape_routes.get(shape_id, set())) if rid in route_by_id]
            labels = [x for r in route_rows for x in (r.get("route_long_name", ""), r.get("route_short_name", "")) if x]
            matches = sorted({code for kind in ("transit_line",) for code in exact_match(idx, kind, labels)})
            source_id = f"shape:{shape_id}"
            if len(matches) != 1:
                add_candidate(report, "transit_line", source_id, " | ".join(labels), "ambiguous" if matches else "unmatched", matches,
                              "GTFS route names did not identify exactly one existing transit_line")
                continue
            entity = by_code[matches[0]]
            if entity["status"] in {"planned", "approved_planned", "under_construction"}:
                add_candidate(report, "transit_line", source_id, " | ".join(labels), "unmatched", [], "planned entity has no evidenced official alignment in this source")
                continue
            coords = [[lon, lat] for _, lon, lat in sorted(sequence)]
            geom = {"type": "LineString", "coordinates": coords}
            if len(coords) < 2 or not in_bbox(geom):
                add_candidate(report, "transit_line", source_id, " | ".join(labels), "unmatched", matches, "geometry is invalid or outside the Greater Cairo bbox")
                continue
            code = "GTFS-SHAPE-" + re.sub(r"[^A-Z0-9-]+", "-", shape_id.upper()).strip("-")[:80]
            out.append(feature(code, entity, geom, "CC-BY-4.0", TFC_ATTRIBUTION, "Transport for Cairo GTFS", {"gtfs_shape_id": shape_id, "gtfs_route_ids": sorted(shape_routes.get(shape_id, set())), "license_evidence_url": license_evidence_url}, date, {"entity_type": "transit_line"}))
            add_candidate(report, "transit_line", source_id, " | ".join(labels), "matched", matches)
        for row in table("stops.txt"):
            sid = row.get("stop_id", "")
            try:
                lon, lat = float(row["stop_lon"]), float(row["stop_lat"])
            except (KeyError, ValueError):
                continue
            geom = {"type": "Point", "coordinates": [lon, lat]}
            label = row.get("stop_name", "")
            matches = []
            for kind in ("transit_stop", "transit_station", "rail_station"):
                matches.extend(exact_match(idx, kind, [label]))
            matches = sorted(set(matches))
            if len(matches) != 1 or not in_bbox(geom):
                add_candidate(report, "transit_stop", f"stop:{sid}", label, "ambiguous" if matches else "unmatched", matches,
                              "GTFS stop name did not identify exactly one existing stop/station" if matches else "no exact existing stop/station name or alias")
                continue
            entity = by_code[matches[0]]
            if entity["status"] in {"planned", "approved_planned", "under_construction"}:
                add_candidate(report, "transit_stop", f"stop:{sid}", label, "unmatched", [], "planned stop lacks official alignment provenance")
                continue
            code = "GTFS-STOP-" + re.sub(r"[^A-Z0-9-]+", "-", sid.upper()).strip("-")[:80]
            out.append(feature(code, entity, geom, "CC-BY-4.0", TFC_ATTRIBUTION, "Transport for Cairo GTFS", {"gtfs_stop_id": sid, "license_evidence_url": license_evidence_url}, date, {"entity_type": entity["entity_type"], "stop_name": label}))
            add_candidate(report, "transit_stop", f"stop:{sid}", label, "matched", matches)
    return out


def overpass_query() -> str:
    w, s, e, n = BBOX
    box = f"{s},{w},{n},{e}"
    return f"""[out:json][timeout:180];(
      way[highway~\"^(motorway|trunk|primary|secondary)$\"][name]({box});
      way[highway~\"^(motorway_link|trunk_link|primary_link|secondary_link)$\"]({box});
      relation[route~\"^(train|subway|light_rail|monorail|bus)$\"]({box});
      way[railway~\"^(subway|light_rail|monorail)$\"][name]({box});
      node[public_transport~\"^(stop_position|platform|station)$\"]({box});
      node[railway~\"^(station|halt)$\"]({box});
      way[railway~\"^(station|platform)$\"]({box});
    );out meta geom;"""


def process_osm(data: dict[str, Any], entities: list[dict[str, str]], date: str,
                report: dict[str, Any], rules: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    idx, by_code = matcher(entities, {"road", "transit_line", "transit_stop", "transit_station", "rail_station"})
    entity_rules = (rules or {}).get("entity_rules", {})
    out: list[dict[str, Any]] = []
    for item in data.get("elements", []):
        tags = item.get("tags", {})
        etype, match_type, geom = None, None, None
        if item["type"] == "node" and (tags.get("public_transport") == "station" or tags.get("railway") in {"station", "halt", "construction"}):
            # Station nodes need the strict name/mode/lifecycle/line matcher below.
            continue
        elif item["type"] == "way" and tags.get("railway") in {"subway", "light_rail", "monorail"}:
            etype, match_type = "transit_line", "transit_line"
            coords = [[p["lon"], p["lat"]] for p in item.get("geometry", []) if "lon" in p and "lat" in p]
            geom = {"type": "LineString", "coordinates": coords}
        elif item["type"] == "relation" and tags.get("route") in {"train", "subway", "light_rail", "monorail", "bus"}:
            etype, match_type = "transit_line", "transit_line"
            lines = []
            for member in item.get("members", []):
                coords = [[p["lon"], p["lat"]] for p in member.get("geometry", []) if "lon" in p and "lat" in p]
                if len(coords) >= 2:
                    lines.append(coords)
            geom = {"type": "MultiLineString", "coordinates": lines}
        if not etype or not match_type or not isinstance(geom, dict):
            continue
        labels = [tags.get(k, "") for k in ("name", "name:ar", "name:en", "ref") if tags.get(k)]
        matches = exact_match(idx, etype, labels)
        if etype == "transit_line":
            normalized_labels = {normalize(label) for label in labels if normalize(label)}
            for code, line_rule in (rules or {}).get("line_entity_rules", {}).items():
                aliases = {normalize(str(alias)) for alias in line_rule.get("match_aliases", []) if normalize(str(alias))}
                if aliases & normalized_labels and code in by_code and by_code[code].get("entity_type") == "transit_line":
                    matches = sorted(set(matches) | {code})
        ident = f"{item['type']}:{item['id']}"
        if len(matches) == 1:
            rule = entity_rules.get(matches[0], {})
            if rule.get("enabled") is False:
                add_candidate(report, match_type, ident, " | ".join(labels), "ambiguous", matches,
                              rule.get("reason", "entity disabled by match rule"))
                continue
            if not geometry_within_bbox(geom, rule.get("bbox_wgs84")):
                add_candidate(report, match_type, ident, " | ".join(labels), "ambiguous", matches,
                              "geometry falls outside the entity-specific match-rule bbox")
                continue
        if len(matches) != 1:
            add_candidate(report, match_type, ident, " | ".join(labels), "ambiguous" if matches else "unmatched", matches,
                          "OSM names did not identify exactly one compatible existing entity")
            continue
        entity = by_code[matches[0]]
        if entity["status"] in {"planned", "approved_planned", "under_construction"}:
            add_candidate(report, match_type, ident, " | ".join(labels), "unmatched", [], "planned entity geometry requires official alignment evidence")
            continue
        if not in_bbox(geom):
            add_candidate(report, match_type, ident, " | ".join(labels), "unmatched", matches, "geometry is invalid or not wholly inside the Greater Cairo bbox")
            continue
        version = int(item.get("version", 0))
        if version < 1:
            add_candidate(report, match_type, ident, " | ".join(labels), "unmatched", matches, "OSM version metadata is missing")
            continue
        code = f"OSM-{item['type'].upper()}-{int(item['id'])}"
        props = {"osm_type": item["type"], "osm_id": int(item["id"]), "osm_version": version}
        out.append(feature(code, entity, geom, "ODbL-1.0", OSM_ATTRIBUTION, "OpenStreetMap", props, date,
                           {"entity_type": etype, "osm_tags": tags}))
        add_candidate(report, match_type, ident, " | ".join(labels), "matched", matches)
    return out


def process_advanced_osm(data: dict[str, Any], entities: list[dict[str, str]], date: str,
                         report: dict[str, Any], rules: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Conservative geometry matching for roads, admin/place, aerodromes and named landmarks."""
    eligible = {"road", "city", "district", "airport", "bridge", "landmark"}
    idx, by_code = matcher(entities, eligible)
    entity_rules = (rules or {}).get("entity_rules", {})
    configured_road_refs = {
        code: {normalize_road_label(str(value)) for value in rule.get("road_refs", []) if normalize_road_label(str(value))}
        for code, rule in entity_rules.items()
    }
    configured_road_aliases = {
        code: {normalize_road_label(str(value)) for value in rule.get("match_aliases", []) if normalize_road_label(str(value))}
        for code, rule in entity_rules.items()
    }
    configured_road_exclusions = {
        code: {normalize_road_label(str(value)) for value in rule.get("exclude_aliases", []) if normalize_road_label(str(value))}
        for code, rule in entity_rules.items()
    }
    elements = data.get("elements", [])
    by_key = {(x.get("type"), x.get("id")): x for x in elements}
    out: list[dict[str, Any]] = []
    used: set[tuple[str, int, str]] = set()
    dropped_short_road_fragments: list[dict[str, Any]] = []
    road_rel_members: dict[tuple[str, int], set[str]] = defaultdict(set)
    matched_road_relations: list[tuple[dict[str, Any], list[str]]] = []

    def labels_for(tags: dict[str, Any], keys: tuple[str, ...]) -> list[str]:
        vals=[]
        for key in keys:
            value=tags.get(key)
            if isinstance(value,str): vals.extend(x.strip() for x in value.split(";") if x.strip())
        return vals

    def coordinate_geometry(item: dict[str, Any], polygon: bool = False) -> dict[str, Any] | None:
        if item.get("type") == "node":
            if isinstance(item.get("lon"),(float,int)) and isinstance(item.get("lat"),(float,int)):
                return {"type":"Point","coordinates":[item["lon"],item["lat"]]}
            return None
        coords=[[p["lon"],p["lat"]] for p in item.get("geometry",[]) if isinstance(p,dict) and "lon" in p and "lat" in p]
        if len(coords)<2:return None
        if polygon and len(coords)>=4 and coords[0]==coords[-1]: return {"type":"Polygon","coordinates":[coords]}
        return {"type":"LineString","coordinates":coords}

    def relation_polygon(item: dict[str, Any]) -> dict[str, Any] | None:
        remaining=[]
        for member in item.get("members",[]):
            if member.get("role") not in ("outer", "") or member.get("type")!="way": continue
            coords=[[p["lon"],p["lat"]] for p in member.get("geometry",[]) if "lon" in p and "lat" in p]
            if len(coords)>=2:remaining.append(coords)
        rings=[]
        while remaining:
            ring=remaining.pop(0)
            while ring[0]!=ring[-1]:
                joined=False
                for index,part in enumerate(remaining):
                    if ring[-1]==part[0]:ring.extend(part[1:])
                    elif ring[-1]==part[-1]:ring.extend(reversed(part[:-1]))
                    else:continue
                    remaining.pop(index);joined=True;break
                if not joined:break
            if len(ring)>=4 and ring[0]==ring[-1]:rings.append(ring)
        if not rings:return None
        return {"type":"MultiPolygon","coordinates":[[ring] for ring in rings]}

    def emit(item: dict[str, Any], entity_code: str, kind: str, geom: dict[str, Any],
             tags: dict[str, Any], extra: dict[str, Any] | None = None,
             feature_code: str | None = None) -> bool:
        entity=by_code[entity_code]
        rule=entity_rules.get(entity_code,{})
        if rule.get("enabled") is False:return False
        if entity.get("status") in {"planned","approved_planned","under_construction"}:return False
        if kind == "road":
            entity_bbox = rule.get("road_bbox_wgs84", rule.get("bbox_wgs84", ROAD_BBOX))
            try:
                clipped = shape(geom).intersection(box(*entity_bbox))
                fragments = [part for part in lineal_parts(clipped) if not part.is_empty and part.length > 0]
                if not fragments:
                    return False
                clipped = unary_union(fragments)
                geom = json.loads(json.dumps(mapping(clipped)))
            except Exception:
                return False
            if not geometry_within_bbox(geom, entity_bbox):return False
        elif not in_bbox(geom) or not geometry_within_bbox(geom, rule.get("bbox_wgs84")):return False
        version=int(item.get("version",0) or 0)
        if version<1:return False
        code=feature_code or f"OSM-{item['type'].upper()}-{int(item['id'])}"
        if code in used:return True
        props={"osm_type":item["type"],"osm_id":int(item["id"]),"osm_version":version}
        out.append(feature(code,entity,geom,"ODbL-1.0",OSM_ATTRIBUTION,"OpenStreetMap",props,date,
                           {"entity_type":kind,"osm_tags":tags,**(extra or {})}))
        used.add(code)
        return True

    # Matched road routes and ways are graph seeds; every attributed geometry remains a raw OSM way.
    road_rel_members: dict[tuple[str, int], set[str]] = defaultdict(set)
    relation_member_ids: dict[str, set[int]] = defaultdict(set)
    matched_road_relations: list[dict[str, Any]] = []
    missing_relation_member_geometries: list[dict[str, Any]] = []
    route_primary_entities: set[str] = set()
    entity_refs: dict[str, set[str]] = defaultdict(set)
    for code, refs in configured_road_refs.items():
        entity_refs[code].update(refs)
    road_seed_ways: dict[str, set[int]] = defaultdict(set)

    road_entity_labels = {
        code: {normalize_road_label(value) for value in (row.get("name_ar", ""), row.get("name_en", ""), *(row.get("aliases", "") or "").split("|")) if normalize_road_label(value)}
        for code, row in by_code.items() if row.get("entity_type") == "road"
    }

    def match_road_labels(values: list[str]) -> list[str]:
        normalized_values = {normalize_road_label(value) for value in values if normalize_road_label(value)}
        matched = set(exact_match(idx, "road", values))
        matched.update(code for code, labels in road_entity_labels.items() if labels & normalized_values)
        matched.update(code for code, refs in configured_road_refs.items() if refs & normalized_values)
        matched.update(code for code, aliases in configured_road_aliases.items() if aliases & normalized_values)
        excluded = {code for code, aliases in configured_road_exclusions.items() if aliases & normalized_values}
        matched.difference_update(excluded)
        return sorted(matched)
    for item in elements:
        tags = item.get("tags", {})
        if item.get("type") != "relation" or tags.get("type") != "route" or tags.get("route") != "road":
            continue
        relation_labels = labels_for(tags, ("name", "name:ar", "name:en", "official_name", "ref"))
        matches = match_road_labels(relation_labels)
        spatial_matches = []
        for code in matches:
            guard = box(*road_bbox_for_entity(code, rules))
            has_geometry_in_guard = False
            for member in item.get("members", []):
                if member.get("type") != "way":
                    continue
                direct = by_key.get(("way", int(member.get("ref", 0) or 0)), {})
                coords = [[point["lon"], point["lat"]] for point in direct.get("geometry", [])
                          if isinstance(point, dict) and "lon" in point and "lat" in point]
                if len(coords) < 2:
                    coords = [[point["lon"], point["lat"]] for point in member.get("geometry", [])
                              if isinstance(point, dict) and "lon" in point and "lat" in point]
                if len(coords) >= 2:
                    try:
                        if shape({"type": "LineString", "coordinates": coords}).intersects(guard):
                            has_geometry_in_guard = True
                            break
                    except Exception:
                        continue
            if has_geometry_in_guard:
                spatial_matches.append(code)
        matches = spatial_matches
        if len(matches) != 1:
            continue
        entity_code = matches[0]
        if entity_rules.get(entity_code, {}).get("enabled") is False:
            continue
        member_way_ids = sorted({int(member["ref"]) for member in item.get("members", [])
                                 if member.get("type") == "way" and member.get("ref") is not None})
        if not member_way_ids:
            continue
        matched_road_relations.append({
            "relation_id": int(item["id"]), "entity_code": entity_code,
            "name": " | ".join(relation_labels), "ref": tags.get("ref"),
            "member_way_ids": member_way_ids,
        })
        route_primary_entities.add(entity_code)
        relation_version = int(item.get("version", 0) or 0)
        for member in item.get("members", []):
            if member.get("type") != "way" or member.get("ref") is None:
                continue
            member_way_id = int(member["ref"])
            direct_way = by_key.get(("way", member_way_id))
            direct_geometry = direct_way.get("geometry", []) if isinstance(direct_way, dict) else []
            stored_member_geometry = member.get("geometry", [])
            if len(direct_geometry) < 2 and len(stored_member_geometry) >= 2:
                missing_relation_member_geometries.append({
                    "relation": item, "entity_code": entity_code, "member_way_id": member_way_id,
                    "geometry": stored_member_geometry,
                })
        for value in str(tags.get("ref", "")).split(";"):
            if normalize_road_label(value):
                entity_refs[entity_code].add(normalize_road_label(value))
        for member in item.get("members", []):
            if member.get("type") == "way" and member.get("ref") is not None:
                way_id = int(member["ref"])
                road_rel_members[("way", way_id)].add(entity_code)
                relation_member_ids[entity_code].add(way_id)

    road_lines: dict[str, list[list[list[float]]]] = defaultdict(list)
    unmatched_road_segments: list[dict[str, Any]] = []
    road_types = {"motorway", "trunk", "primary", "secondary", "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary"}

    # Relation member ways are primary for entities with a matching route=road relation.
    for item in elements:
        if item.get("type") != "way":
            continue
        tags = item.get("tags", {})
        highway = tags.get("highway")
        key = ("way", int(item["id"]))
        relation_matches = sorted(road_rel_members.get(key, set()))
        road_names = labels_for(tags, ("name", "name:ar", "name:en", "ref", "old_name", "alt_name"))
        coords = [[point["lon"], point["lat"]] for point in item.get("geometry", []) if "lon" in point and "lat" in point]
        matches = relation_matches or match_road_labels(road_names)
        if not highway and not relation_matches:
            continue
        if highway and highway not in road_types:
            continue
        # Generic aliases can belong to multiple corridors (notably the two 90th Streets
        # and Nasr/Autostrad). Resolve only when the stored way lies inside exactly one
        # entity-specific guard; otherwise retain the ambiguity rather than guessing.
        if len(matches) > 1 and len(coords) >= 2:
            candidate_geom = {"type": "LineString", "coordinates": coords}
            guarded = []
            for code in matches:
                guard = road_bbox_for_entity(code, rules)
                if not guard:
                    continue
                try:
                    clipped_candidate = shape(candidate_geom).intersection(box(*guard))
                    if sum(part.length for part in lineal_parts(clipped_candidate)) > 0:
                        guarded.append(code)
                except Exception:
                    continue
            if len(guarded) == 1:
                matches = guarded
        if len(matches) != 1:
            if matches:
                add_candidate(report, "road", f"way:{item['id']}", " | ".join(road_names), "ambiguous", matches, "road name/ref is not unique")
            continue
        entity_code = matches[0]
        if not relation_matches and entity_code in route_primary_entities:
            # Do not broaden a route-relation alignment with similarly named roads elsewhere.
            continue
        geom = {"type": "LineString", "coordinates": coords}
        if len(coords) < 2:
            continue
        if by_code[entity_code].get("status") in {"planned", "approved_planned", "under_construction"}:
            add_candidate(report, "road", f"way:{item['id']}", " | ".join(road_names), "unmatched", [], "lifecycle policy does not permit OSM alignment for this status")
            continue
        match_method = "route_relation" if relation_matches else "exact_name"
        extra = {"entity_type": "road", "osm_tags": tags, "match_method": match_method,
                 "road_geometry_match": "OSM route=road relation member" if relation_matches else "exact road name/ref"}
        if emit(item, entity_code, "road", geom, tags, extra):
            way_id = int(item["id"])
            road_seed_ways[entity_code].add(way_id)
            for value in str(tags.get("ref", "")).split(";"):
                if normalize_road_label(value):
                    entity_refs[entity_code].add(normalize_road_label(value))
            road_lines[entity_code].append(coords)
            add_candidate(report, "road", f"way:{item['id']}", " | ".join(road_names), "matched", matches)
        else:
            unmatched_road_segments.append({"source_id": f"way:{item['id']}", "entity_code": entity_code,
                                           "name": tags.get("name") or tags.get("name:ar") or tags.get("ref"),
                                           "endpoints": [coords[0], coords[-1]],
                                           "reason": "bbox, lifecycle, lineage, or existing match rule rejected geometry"})

    # Some raw extracts omit a member-way element while preserving its explicit geometry
    # on the matching route relation. Retain that stored geometry with truthful relation
    # lineage and member ID; do not fabricate a way version or insert it into the node graph.
    relation_member_geometry_results = []
    for fallback in missing_relation_member_geometries:
        relation = fallback["relation"]
        member_way_id = fallback["member_way_id"]
        coords = [[point["lon"], point["lat"]] for point in fallback["geometry"]
                  if isinstance(point, dict) and "lon" in point and "lat" in point]
        if len(coords) < 2:
            continue
        relation_tags = relation.get("tags", {})
        fallback_geometry = {"type": "LineString", "coordinates": coords}
        code = f"OSM-RELATION-{int(relation['id'])}-MEMBER-WAY-{member_way_id}"
        extra = {"entity_type": "road", "osm_tags": relation_tags,
                 "match_method": "route_relation_member_geometry",
                 "road_geometry_match": "stored OSM route relation member geometry; direct way geometry absent",
                 "relation_member_way_id": member_way_id}
        if emit(relation, fallback["entity_code"], "road", fallback_geometry, relation_tags, extra, code):
            relation_member_geometry_results.append({"relation_id": int(relation["id"]),
                "relation_version": int(relation.get("version", 0) or 0), "entity_code": fallback["entity_code"],
                "member_way_id": member_way_id, "lineage": "relation", "nodes_available_for_graph": False})

    # Build topology from real OSM node IDs, then drop only disconnected components whose
    # cumulative clipped length is under 300 m (never individual short way segments).
    graph_ways, graph_adjacency = build_road_graph(elements)
    dropped_short_road_fragments = []
    for entity_code, attributed_ids in road_seed_ways.items():
        pending = set(attributed_ids) & set(graph_ways)
        node_to_way_ids: dict[int, set[int]] = defaultdict(set)
        for way_id in pending:
            for node_id in graph_ways[way_id]["nodes"]:
                node_to_way_ids[node_id].add(way_id)
        components = []
        while pending:
            start = pending.pop()
            component = {start}
            stack = [start]
            while stack:
                current = stack.pop()
                for node_id in graph_ways[current]["nodes"]:
                    for neighbor in node_to_way_ids[node_id] & pending:
                        pending.remove(neighbor)
                        component.add(neighbor)
                        stack.append(neighbor)
            components.append(component)
        guard = box(*road_bbox_for_entity(entity_code, rules))
        for component in components:
            component_length = 0.0
            for way_id in component:
                way_geom = shape({"type": "LineString", "coordinates": [list(point) for point in graph_ways[way_id]["_coordinates"]]}).intersection(guard)
                for part in lineal_parts(way_geom):
                    component_length += sum(haversine_km(a, b) for a, b in zip(list(part.coords), list(part.coords)[1:]))
            if component_length >= 0.3:
                continue
            ids = sorted(component)
            dropped_short_road_fragments.append({"entity_code": entity_code, "way_ids": ids,
                "length_km": round(component_length, 3), "reason": "disconnected_component_under_300m"})
            road_seed_ways[entity_code].difference_update(component)
            out[:] = [feature_item for feature_item in out if not (
                feature_item.get("properties", {}).get("entity_code") == entity_code
                and feature_item.get("properties", {}).get("osm_id") in component
                and feature_item.get("properties", {}).get("osm_type") == "way")]
    urban_component_filter_results: list[dict[str, Any]] = []
    def entity_feature_extent(entity_code: str) -> list[float] | None:
        geometries = []
        for feature_item in out:
            if feature_item.get("properties", {}).get("entity_code") != entity_code:
                continue
            try:
                geometries.append(shape(feature_item["geometry"]))
            except Exception:
                continue
        if not geometries:
            return None
        return list(unary_union(geometries).bounds)

    for entity_code, attributed_ids in road_seed_ways.items():
        component_rule = entity_rules.get(entity_code, {}).get("urban_component_filter")
        if not isinstance(component_rule, dict):
            continue
        extent_before = entity_feature_extent(entity_code)
        max_distance_km = float(component_rule.get("max_component_distance_km", 3.0))
        eligible_ids = set(attributed_ids) & set(graph_ways)
        node_to_way_ids: dict[int, set[int]] = defaultdict(set)
        for way_id in eligible_ids:
            for node_id in graph_ways[way_id]["nodes"]:
                node_to_way_ids[node_id].add(way_id)
        pending = set(eligible_ids)
        components: list[set[int]] = []
        while pending:
            start = pending.pop()
            component = {start}
            stack = [start]
            while stack:
                current = stack.pop()
                for node_id in graph_ways[current]["nodes"]:
                    for neighbor in node_to_way_ids[node_id] & pending:
                        pending.remove(neighbor)
                        component.add(neighbor)
                        stack.append(neighbor)
            components.append(component)
        guard = box(*road_bbox_for_entity(entity_code, rules))
        geometries_by_component: list[tuple[set[int], BaseGeometry, float]] = []
        for component in components:
            parts: list[BaseGeometry] = []
            component_length = 0.0
            for way_id in component:
                way = graph_ways[way_id]
                line = shape({"type": "LineString", "coordinates": [list(point) for point in way["_coordinates"]]}).intersection(guard)
                parts.extend(part for part in lineal_parts(line) if not part.is_empty and part.length > 0)
                component_length += sum(haversine_km(a, b) for part in lineal_parts(line)
                                        for a, b in zip(list(part.coords), list(part.coords)[1:]))
            if parts:
                geometries_by_component.append((component, unary_union(parts), component_length))
        geometries_by_component.sort(key=lambda item: (item[2], len(item[0])), reverse=True)
        kept_ids: set[int] = set()
        dropped_components: list[dict[str, Any]] = []
        if geometries_by_component:
            largest_ids, largest_geometry, _ = geometries_by_component[0]
            kept_ids.update(largest_ids)
            for component, component_geometry, component_length in geometries_by_component[1:]:
                point_a, point_b = nearest_points(largest_geometry, component_geometry)
                distance_km = haversine_km((point_a.x, point_a.y), (point_b.x, point_b.y))
                if distance_km <= max_distance_km:
                    kept_ids.update(component)
                    continue
                dropped_ids = sorted(component)
                dropped_components.append({
                    "way_ids": dropped_ids,
                    "component_extent_wgs84": list(component_geometry.bounds),
                    "length_km": round(component_length, 3),
                    "distance_to_largest_km": round(distance_km, 3),
                    "reason": "urban_axis_component_outside_3km_of_largest",
                })
                road_seed_ways[entity_code].difference_update(component)
                dropped_way_ids = set(dropped_ids)
                out[:] = [feature_item for feature_item in out if not (
                    feature_item.get("properties", {}).get("entity_code") == entity_code
                    and feature_item.get("properties", {}).get("osm_type") == "way"
                    and feature_item.get("properties", {}).get("osm_id") in dropped_way_ids)]
                for outcome in report.get("_outcomes", []):
                    if outcome.get("source_id") in {f"way:{way_id}" for way_id in dropped_ids} and outcome.get("outcome") == "matched":
                        outcome["outcome"] = "unmatched"
                        outcome["reason"] = "outside configured urban axis bbox/component connectivity scope"
        urban_component_filter_results.append({
            "entity_code": entity_code,
            "max_component_distance_km": max_distance_km,
            "extent_before_wgs84": extent_before,
            "extent_after_wgs84": entity_feature_extent(entity_code),
            "components_before": len(geometries_by_component),
            "components_kept": sum(1 for component, _, _ in geometries_by_component if component & kept_ids),
            "components_dropped": dropped_components,
        })

    road_study_area = box(*road_graph_bbox(rules))
    graph_ways = {way_id: way for way_id, way in graph_ways.items()
                  if shape({"type": "LineString", "coordinates": [list(point) for point in way["_coordinates"]]}).intersects(road_study_area)}
    graph_adjacency = {node: [edge for edge in edges if edge[1] in graph_ways]
                       for node, edges in graph_adjacency.items() if any(edge[1] in graph_ways for edge in edges)}
    gap_config = (rules or {}).get("road_gap_fill", {})
    default_max_km = float(gap_config.get("max_path_km", 3.0))
    topology_gap_threshold_km = float(gap_config.get("topology_gap_threshold_m", 25.0)) / 1000.0
    gap_results: list[dict[str, Any]] = []
    gap_fills: dict[int, list[float]] = defaultdict(list)
    road_entity_codes = sorted(code for code, entity in by_code.items() if entity.get("entity_type") == "road")
    for entity_code in road_entity_codes:
        rule = entity_rules.get(entity_code, {})
        max_km = float(rule.get("road_gap_fill_max_km", default_max_km))
        entity_graph_bbox = box(*road_bbox_for_entity(entity_code, rules))
        entity_graph_ways = {
            way_id: way for way_id, way in graph_ways.items()
            if shape({"type": "LineString", "coordinates": [list(point) for point in way["_coordinates"]]}).intersects(entity_graph_bbox)
        }
        entity_graph_adjacency = {
            node: [edge for edge in edges if edge[1] in entity_graph_ways]
            for node, edges in graph_adjacency.items()
            if any(edge[1] in entity_graph_ways for edge in edges)
        }
        seed_ids = road_seed_ways.get(entity_code, set()) & set(entity_graph_ways)
        if not seed_ids:
            gap_results.append({"entity_code": entity_code, "components_before": 0, "gaps_before": 0,
                                "components_after": 0, "gaps_after": 0, "gaps_closed": 0, "km_closed": 0.0,
                                "filled_way_ids": [], "paths": [], "unresolved_gaps": [],
                                "max_path_km": max_km, "entity_name_ar": by_code[entity_code].get("name_ar", ""),
                                "entity_name_en": by_code[entity_code].get("name_en", ""),
                                "note": "no matching motorway/trunk/primary seed ways"})
            continue
        entity_names = road_entity_labels.get(entity_code, set()) | configured_road_aliases.get(entity_code, set())
        entity_graph = filter_graph_for_entity(
            entity_graph_ways, entity_graph_adjacency, entity_names, entity_refs[entity_code],
            relation_member_ids.get(entity_code, set()), allow_interchange_links=True,
            allow_bridges=bool(rule.get("allow_bridge_ways", False)),
        )
        result = connect_seed_components(entity_code=entity_code, seed_way_ids=seed_ids, ways=entity_graph_ways,
                                         adjacency=entity_graph, max_km=max_km,
                                         topology_gap_threshold_km=topology_gap_threshold_km)
        result["max_path_km"] = max_km
        result["entity_name_ar"] = by_code[entity_code].get("name_ar", "")
        result["entity_name_en"] = by_code[entity_code].get("name_en", "")
        gap_results.append(result)
        for path in result["paths"]:
            for way_id in path["filled_way_ids"]:
                gap_fills[way_id].append(path["path_length_km"])
        for way_id in result["filled_way_ids"]:
            item = graph_ways[way_id]
            coords = [[lon, lat] for lon, lat in item["_coordinates"]]
            geom = {"type": "LineString", "coordinates": coords}
            extra = {"entity_type": "road", "osm_tags": item.get("tags", {}),
                     "match_method": "gap_fill_graph", "road_geometry_match": "shortest eligible shared-node OSM path",
                     "graph_path_length_km": round(sum(gap_fills[way_id]), 3)}
            if emit(item, entity_code, "road", geom, item.get("tags", {}), extra):
                road_seed_ways[entity_code].add(way_id)
                road_lines[entity_code].append(coords)
                add_candidate(report, "road", f"way:{way_id}", " | ".join(labels_for(item.get("tags", {}),
                                                                        ("name", "name:ar", "name:en", "ref"))),
                              "matched", [entity_code], "gap_fill_graph: real OSM way on an eligible shortest path")
            else:
                unmatched_road_segments.append({"source_id": f"way:{way_id}", "entity_code": entity_code,
                                               "endpoints": [coords[0], coords[-1]],
                                               "reason": "graph path way failed geometry/lifecycle import constraints"})

    report["road_gap_fill_by_entity"] = gap_results
    west_endpoint = Point(30.5148, 29.7646)
    west_patch_ways = []
    for feature_item in out:
        props = feature_item.get("properties", {})
        if props.get("entity_code") != "ROAD-REGIONAL-RING" or props.get("osm_type") != "way":
            continue
        try:
            geometry = shape(feature_item["geometry"])
            nearest = nearest_points(west_endpoint, geometry)[1]
            distance_m = haversine_km((west_endpoint.x, west_endpoint.y), (nearest.x, nearest.y)) * 1000
            if geometry.bounds[0] < 30.5 and distance_m <= 150:
                west_patch_ways.append({"osm_id": props.get("osm_id"), "distance_to_old_clip_point_m": round(distance_m, 1),
                                       "westmost_lon": geometry.bounds[0]})
        except Exception:
            continue
    west_patch_closed = bool(west_patch_ways)
    report["regional_ring_west_patch"] = {
        "status": "closed_by_new_osm_extract" if west_patch_closed else "source_clipped_edge_remains",
        "old_endpoint_wgs84": [30.5148, 29.7646], "previous_west_limit_lon": 30.5,
        "road_bbox_wgs84": road_bbox_for_entity("ROAD-REGIONAL-RING", rules),
        "accepted_patch_ways": west_patch_ways,
        "reason": "new, matched OSM route=road ref=515 ways extend west of the old clip and cover the former dangling endpoint"
                 if west_patch_closed else "no matched regional-ring way covers the old clip point west of lon 30.5",
    }
    source_clipped_regional_edge = {
        "entity_code": "ROAD-REGIONAL-RING", "gap_type": "source_clipped_edge",
        "coordinate_wgs84": [30.5148, 29.7646], "source_bbox_west_lon": 30.5,
        "reason": "source clipped at lon 30.5; westward regional-ring continuation lies outside accepted geometry; supplemental patch unavailable",
    }
    if not west_patch_closed:
        for gap_result in gap_results:
            if gap_result.get("entity_code") == "ROAD-REGIONAL-RING":
                gap_result.setdefault("source_clipped_edges", []).append(source_clipped_regional_edge)
                gap_result.setdefault("unresolved_gaps", []).append(source_clipped_regional_edge)
    report["source_clipped_road_edges"] = [] if west_patch_closed else [source_clipped_regional_edge]
    report["road_gaps"] = [gap for result in gap_results for gap in result.get("unresolved_gaps", [])]
    report["road_topology_gaps"] = [gap for gap in report["road_gaps"] if gap.get("gap_type") == "osm_topology_gap"]
    report["road_route_relations"] = matched_road_relations
    report["road_route_entities"] = sorted(route_primary_entities)
    report["dropped_road_fragments_under_300m"] = dropped_short_road_fragments
    report["urban_axis_component_filter"] = urban_component_filter_results
    report["relation_member_geometries_used"] = relation_member_geometry_results
    report.setdefault("rejected_road_segments", []).extend(unmatched_road_segments)

    # Named administrative polygons/place nodes, aerodromes, bridges and landmarks.
    for item in elements:
        typ=item.get("type"); tags=item.get("tags",{})
        kind=None; geom=None; match_values=[]
        if tags.get("boundary")=="administrative":
            # Administrative polygons are routed through the strict point-anchored boundary pipeline.
            continue
        elif typ=="node" and tags.get("place") in {"city","town","suburb","quarter","neighbourhood","village","locality"}:
            kind="city" if tags.get("place") in {"city","town","village"} else "district"
            match_values=labels_for(tags,("name","name:ar","name:en","alt_name")); geom=coordinate_geometry(item)
        elif tags.get("aeroway")=="aerodrome":
            kind="airport"; match_values=labels_for(tags,("name","name:ar","name:en","official_name","iata","icao"))
            geom=relation_polygon(item) if typ=="relation" else coordinate_geometry(item,True)
            if geom and geom.get("type")=="LineString":geom=None
        elif tags.get("bridge") in {"yes","viaduct","movable","covered"} or tags.get("man_made")=="bridge":
            kind="bridge"; match_values=labels_for(tags,("name","name:ar","name:en","official_name","alt_name"))
            geom=coordinate_geometry(item,True) if tags.get("area")=="yes" else coordinate_geometry(item)
            if geom and geom.get("type")=="Polygon":geom={"type":"LineString","coordinates":geom["coordinates"][0]}
        elif tags.get("amenity") in {"university","college"} or tags.get("tourism") in {"museum","attraction"} or tags.get("historic") or tags.get("leisure")=="park":
            kind="landmark"; match_values=labels_for(tags,("name","name:ar","name:en","official_name","alt_name"))
            geom=relation_polygon(item) if typ=="relation" else coordinate_geometry(item,True)
            if geom and geom.get("type")=="LineString":geom=coordinate_geometry(item)
        if kind is None or not geom or not match_values:continue
        matches=exact_match(idx,kind,match_values)
        ident=f"{typ}:{item.get('id')}"
        if len(matches)!=1:
            outcome="ambiguous" if matches else "unmatched"
            if len(matches)>1 or any(normalize(x) for x in match_values):
                add_candidate(report,kind,ident," | ".join(match_values),outcome,matches,"exact name/alias did not identify one eligible existing entity")
            continue
        entity=by_code[matches[0]]
        if entity.get("status") in {"planned","approved_planned","under_construction"}:
            add_candidate(report,kind,ident," | ".join(match_values),"unmatched",[],"planned entity geometry is prohibited without official alignment evidence")
            continue
        if not in_bbox(geom):
            add_candidate(report,kind,ident," | ".join(match_values),"unmatched",matches,"geometry is invalid or outside the declared bbox")
            continue
        if emit(item,matches[0],kind,geom,tags):
            add_candidate(report,kind,ident," | ".join(match_values),"matched",matches)
        else:
            add_candidate(report,kind,ident," | ".join(match_values),"unmatched",matches,"entity match rule, lifecycle, OSM version or bbox rejected geometry")

    return out



def road_name_search_audit(data: dict[str, Any], entities: list[dict[str, str]],
                           rules: dict[str, Any], features: list[dict[str, Any]]) -> dict[str, Any]:
    """Record literal normalized name/ref searches over stored way and route-relation tags."""
    by_code = {entity["code"]: entity for entity in entities}
    feature_counts = Counter(item.get("properties", {}).get("entity_code") for item in features)
    requested = [
        "ROAD-HARAM", "ROAD-90-NORTH", "ROAD-90-SOUTH", "ROAD-AUTOSTRAD", "ROAD-CORNICHE",
        "ROAD-NASR", "ROAD-GAMET-EL-DOWAL", "ROAD-MOSHIR-TANTAWY", "ROAD-ADLY-MANSOUR-AXIS",
        "ROAD-MOSTOROD-AXIS", "ROAD-MOKATTAM-AXIS", "ROAD-WAHAT", "ROAD-CAIRO-FAYOUM",
        "ROAD-CAIRO-ASSIUT-AGRI", "ROAD-WESTERN-DESERT", "ROAD-EASTERN-DESERT", "ROAD-MARYUTEYA",
        "ROAD-DAHSHUR-LINK", "ROAD-BILBEIS-DESERT", "ROAD-BENHA-MANSOURA", "ROAD-ISMAILIA-AGRI",
        "ROAD-REGIONAL-NW-ARC", "ROAD-REGIONAL-RING", "ROAD-26-JULY", "ROAD-CAIRO-ALEX-AGRI", "ROAD-CAIRO-SUEZ",
    ]
    searchable = []
    for item in data.get("elements", []):
        tags = item.get("tags", {})
        if item.get("type") == "way":
            if tags.get("highway") not in ROAD_HIGHWAYS:
                continue
            points = [[p["lon"], p["lat"]] for p in item.get("geometry", []) if "lon" in p and "lat" in p]
        elif item.get("type") == "relation" and tags.get("type") == "route" and tags.get("route") == "road":
            points = [[p["lon"], p["lat"]] for member in item.get("members", [])
                      for p in member.get("geometry", []) if "lon" in p and "lat" in p]
        else:
            continue
        labels = []
        for key in ("name", "name:ar", "name:en", "official_name", "alt_name", "old_name", "ref", "old_ref"):
            value = tags.get(key)
            if isinstance(value, str):
                labels.extend(part.strip() for part in value.split(";") if part.strip())
        searchable.append((item, {normalize_road_label(value) for value in labels if normalize_road_label(value)}, points))
    audit = {}
    for code in requested:
        entity = by_code.get(code)
        if not entity:
            continue
        rule = rules.get("entity_rules", {}).get(code, {})
        queries = [entity.get("name_ar", ""), entity.get("name_en", "")]
        queries.extend((entity.get("aliases", "") or "").split("|"))
        queries.extend(rule.get("match_aliases", []))
        queries.extend(rule.get("road_refs", []))
        queries.extend(rule.get("search_terms", []))
        query_values = list(dict.fromkeys(query.strip() for query in queries if isinstance(query, str) and query.strip()))
        bbox = road_bbox_for_entity(code, rules)
        bbox_shape = box(*bbox)
        searched = []
        all_ids = set()
        guarded_ids = set()
        for query in query_values:
            normalized = normalize_road_label(query)
            if not normalized:
                continue
            matches = []
            guarded = []
            for item, labels, points in searchable:
                if normalized not in labels:
                    continue
                source_id = f"{item['type']}:{item['id']}"
                matches.append(source_id)
                if len(points) >= 2:
                    try:
                        if shape({"type": "LineString", "coordinates": points}).intersects(bbox_shape):
                            guarded.append(source_id)
                    except Exception:
                        pass
            all_ids.update(matches)
            guarded_ids.update(guarded)
            if matches:
                searched.append({"query": query, "normalized_query": normalized,
                                 "candidate_count": len(matches), "within_entity_bbox_count": len(guarded),
                                 "candidate_ids": sorted(matches)[:20], "within_entity_bbox_ids": sorted(guarded)[:20]})
        count = feature_counts.get(code, 0)
        audit[code] = {
            "status": entity.get("status"), "geometry_feature_count": count,
            "queries_tried": query_values,
            "queries_with_raw_candidates": searched,
            "unique_raw_candidate_count": len(all_ids),
            "unique_candidates_intersecting_entity_bbox": len(guarded_ids),
            "result": "matched" if count else "unmatched_no_accepted_geometry",
            "unmatched_reason": ("No eligible stored OSM way/relation name/ref candidate survived matching and the entity-specific spatial guard."
                                 if not count else None),
        }
    return audit


def new_report():
    types=("road","transit_line","transit_stop","rail_station","city","district","airport","bridge","landmark")
    return {"by_type": {t: {k: 0 for k in ("matched", "unmatched", "ambiguous")} for t in types}, "unmatched": [], "ambiguous": [], "road_gaps": [], "road_gap_fill_by_entity": [], "road_route_relations": [], "road_route_entities": [], "rejected_road_segments": [], "geometry_repairs": [], "invalid_geometry": []}


def load_osm(args) -> dict[str, Any]:
    if args.osm_json:
        input_path = Path(args.osm_json)
        opener = gzip.open if input_path.suffix == ".gz" else open
        with opener(input_path, "rt", encoding="utf-8") as stream:
            return json.load(stream)
    if not args.fetch_osm:
        return {"elements": []}
    req = urllib.request.Request(OVERPASS_URL, data=urllib.parse.urlencode({"data": overpass_query()}).encode(), headers={"User-Agent": "GreaterCairoAtlas/0.1 (offline feature ingestion)"})
    with urllib.request.urlopen(req, timeout=240) as response:
        return json.loads(response.read())


def sha256_uncompressed_json(path: Path) -> str:
    digest = hashlib.sha256()
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def new_extract_inventory(data: dict[str, Any]) -> dict[str, Any]:
    elements = data.get("elements", [])
    place_counts = Counter(f"{item.get('type')}:{item.get('tags', {}).get('place')}" for item in elements
                          if item.get("tags", {}).get("place") in {"city", "town", "suburb", "quarter", "neighbourhood"})
    admin_levels = Counter(str(item.get("tags", {}).get("admin_level", "missing")) for item in elements
                          if item.get("type") == "relation" and item.get("tags", {}).get("boundary") == "administrative")
    route_counts = Counter(str(item.get("tags", {}).get("route")) for item in elements
                           if item.get("type") == "relation" and item.get("tags", {}).get("type") == "route")
    node_counts = Counter(str(item.get("tags", {}).get("railway")) for item in elements
                          if item.get("type") == "node" and item.get("tags", {}).get("railway") in {"station", "stop", "halt", "construction"})
    public_transport_station_nodes = sum(item.get("type") == "node" and item.get("tags", {}).get("public_transport") == "station"
                                         for item in elements)
    highway_counts = Counter(str(item.get("tags", {}).get("highway")) for item in elements
                             if item.get("type") == "way" and item.get("tags", {}).get("highway") in
                             {"motorway", "trunk", "primary", "motorway_link", "trunk_link", "primary_link"})
    brt_nodes = []
    for item in elements:
        tags = item.get("tags", {})
        if item.get("type") != "node" or tags.get("bus") != "yes":
            continue
        names_value = " ".join(str(tags.get(key, "")) for key in ("name", "name:ar", "name:en"))
        if "brt" in names_value.casefold() or "ترددي" in names_value:
            brt_nodes.append({"osm_id": int(item.get("id", 0) or 0), "name": tags.get("name"),
                              "name_ar": tags.get("name:ar"), "name_en": tags.get("name:en")})
    return {"elements_total": len(elements), "element_types": dict(Counter(item.get("type") for item in elements)),
            "place_elements_by_type_and_value": dict(sorted(place_counts.items())),
            "administrative_boundary_relation_counts_by_level": dict(sorted(admin_levels.items())),
            "route_relation_counts_by_route": dict(sorted(route_counts.items())),
            "railway_station_stop_halt_construction_nodes": dict(sorted(node_counts.items())),
            "public_transport_station_nodes": public_transport_station_nodes,
            "selected_highway_ways": dict(sorted(highway_counts.items())),
            "bus_yes_named_brt_nodes": brt_nodes}


def merge_osm_documents(documents: list[dict[str, Any]]) -> dict[str, Any]:
    """Deduplicate overlapping saved extracts, preferring current versions and full geometry."""
    merged: dict[tuple[str, int], dict[str, Any]] = {}
    for document in documents:
        for item in document.get("elements", []):
            if item.get("type") not in {"node", "way", "relation"} or item.get("id") is None:
                continue
            key = (item["type"], int(item["id"]))
            previous = merged.get(key)
            def completeness(value: dict[str, Any]) -> tuple[int, int, int, int]:
                geometry_count = len(value.get("geometry", []))
                if value.get("type") == "relation":
                    geometry_count += sum(len(member.get("geometry", [])) for member in value.get("members", []))
                return (int(value.get("version", 0) or 0), geometry_count,
                        len(value.get("nodes", [])), len(value.get("members", [])))
            if previous is None or completeness(item) > completeness(previous):
                merged[key] = item
    elements = sorted(merged.values(), key=lambda item: (item["type"], int(item["id"])))
    return {"elements": elements}


def lineal_parts(geom: BaseGeometry) -> list[BaseGeometry]:
    if geom.geom_type in {"LineString", "LinearRing"}:
        return [geom]
    if geom.geom_type in {"MultiLineString", "GeometryCollection"}:
        return [line for part in geom.geoms for line in lineal_parts(part)]
    return []


def build_road_network(data: dict[str, Any], output_path: Path, detail_path: Path) -> dict[str, Any]:
    """Write separate coarse/detail non-entity OSM layers generalized for zoom ranges."""
    cairo_bbox = box(*ROAD_BBOX)
    context_highways = ROAD_HIGHWAYS
    coarse_features = []
    detail_features = []
    dropped_short_fragments = 0
    for item in data.get("elements", []):
        tags = item.get("tags", {})
        if item.get("type") != "way" or tags.get("highway") not in context_highways:
            continue
        coords = [[point["lon"], point["lat"]] for point in item.get("geometry", []) if "lon" in point and "lat" in point]
        if len(coords) < 2:
            continue
        clipped = shape({"type": "LineString", "coordinates": coords}).intersection(cairo_bbox)
        parts = [line for line in lineal_parts(clipped) if not line.is_empty and line.length > 0]
        if not parts:
            continue
        geom = unary_union(parts)
        properties = {
            "osm_type": "way", "osm_id": int(item["id"]), "osm_version": int(item.get("version", 0) or 0),
            "highway": tags.get("highway"), "name": tags.get("name"), "name_ar": tags.get("name:ar"),
            "name_en": tags.get("name:en"), "ref": tags.get("ref"), "license": "ODbL-1.0",
            "attribution": OSM_ATTRIBUTION, "context_only": True,
        }
        for tolerance, features in ((0.00035, coarse_features), (0.000035, detail_features)):
            simplified = geom.simplify(tolerance, preserve_topology=False)
            if not simplified.is_empty:
                features.append({"type": "Feature", "id": f"OSM-WAY-{int(item['id'])}",
                                 "geometry": mapping(simplified), "properties": properties})
    output_path.parent.mkdir(parents=True, exist_ok=True)
    detail_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps({"type": "FeatureCollection", "features": coarse_features}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    detail_path.write_text(json.dumps({"type": "FeatureCollection", "features": detail_features}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return {"path": str(output_path.relative_to(ROOT)), "feature_count": len(coarse_features),
            "simplification_tolerance_degrees": 0.00035, "detail_path": str(detail_path.relative_to(ROOT)),
            "detail_feature_count": len(detail_features), "detail_simplification_tolerance_degrees": 0.000035,
            "license": "ODbL-1.0", "attribution": OSM_ATTRIBUTION,
            "bbox_wgs84": list(ROAD_BBOX), "dropped_fragments_under_300m": dropped_short_fragments}


def build_entity_map_geometries(features: list[dict[str, Any]], output_path: Path) -> dict[str, Any]:
    """Merge and simplify actual source geometries for lighter entity-page map props."""
    by_entity: dict[str, list[tuple[BaseGeometry, dict[str, Any]]]] = defaultdict(list)
    for item in features:
        props = item.get("properties", {})
        entity_code = props.get("entity_code")
        try:
            geom = shape(item["geometry"])
        except (KeyError, TypeError, ValueError):
            continue
        if entity_code and not geom.is_empty:
            by_entity[entity_code].append((geom, props))
    geometries = {}
    for entity_code, parts in sorted(by_entity.items()):
        merged = unary_union([geom for geom, _ in parts])
        simplified = merged.simplify(0.0002, preserve_topology=True)
        licenses = sorted({str(props.get("license")) for _, props in parts if props.get("license")})
        attributions = sorted({str((props.get("properties") or {}).get("attribution"))
                               for _, props in parts if (props.get("properties") or {}).get("attribution")})
        sources = sorted({str((props.get("properties") or {}).get("source"))
                          for _, props in parts if (props.get("properties") or {}).get("source")})
        retrieval_dates = sorted({str((props.get("properties") or {}).get("retrieval_date"))
                                  for _, props in parts if (props.get("properties") or {}).get("retrieval_date")})
        geometries[entity_code] = {
            "geometry": mapping(simplified if not simplified.is_empty else merged),
            "license": licenses, "attribution": attributions, "sources": sources,
            "retrieval_dates": retrieval_dates,
        }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps({"version": 1, "simplification_tolerance_degrees": 0.0002,
                                       "geometries": geometries}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return {"path": str(output_path.relative_to(ROOT)), "entities_with_geometry": len(geometries),
            "simplification_tolerance_degrees": 0.0002, "merge": "shapely.unary_union; no synthetic segments",
            "preserved_metadata": ["license", "attribution", "source", "retrieval_date"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--osm-json", action="append", help="Previously downloaded Overpass JSON extract (repeatable)")
    parser.add_argument("--osm-source-url", help="Original OSM extract URL when using --osm-json")
    parser.add_argument("--osm-retrieval-date", help="ISO date the supplied OSM extract was retrieved")
    parser.add_argument("--osm-boundaries", default=str(ROOT / "data/raw/cairo-osm-boundaries-2026-11-14.json.gz"), help="Optional OSM boundary JSON(.gz); when absent existing boundary output is preserved")
    parser.add_argument("--boundaries-out", default=str(OUT / "boundaries.geojson"), help="Separate lazy-served OSM area boundary FeatureCollection")
    parser.add_argument("--fetch-osm", action="store_true", help="Fetch matching objects from Overpass now")
    parser.add_argument("--gtfs-zip", help="TfC GTFS zip from the Transport Data Commons release")
    parser.add_argument("--gtfs-retrieval-date", help="ISO date the supplied GTFS archive was retrieved")
    parser.add_argument("--gtfs-license", help="Must explicitly be CC-BY-4.0; CC-BY-NC is rejected")
    parser.add_argument("--gtfs-license-evidence-url", help="Exact Transport Data Commons dataset page documenting CC-BY-4.0")
    parser.add_argument("--match-rules", default=str(OUT / "match-rules.json"), help="Optional per-entity OSM match rules JSON")
    parser.add_argument("--road-network-out", default=str(ROOT / "public/road-network.geojson"), help="Static generalized non-entity road context layer output")
    parser.add_argument("--road-network-detail-out", default=str(ROOT / "public/road-network-detail.geojson"), help="Static detailed non-entity road context layer output")
    parser.add_argument("--entity-map-out", default=str(ROOT / "data/derived/entity-map-geometries.json"), help="Simplified merged geometry for entity pages")
    parser.add_argument("--out", default=str(OUT))
    parser.add_argument("--check-geojson", help="Validate an existing GeoJSON feature collection against PostGIS geometry rules without modifying it")
    args = parser.parse_args()
    if args.check_geojson:
        try:
            collection=json.loads(Path(args.check_geojson).read_text(encoding="utf-8"))
            if not isinstance(collection,dict) or collection.get("type")!="FeatureCollection" or not isinstance(collection.get("features"),list):
                raise ValueError("expected a GeoJSON FeatureCollection")
            check_rules = json.loads(Path(args.match_rules).read_text(encoding="utf-8")) if Path(args.match_rules).exists() else {}
            _, geometry_summary=validate_feature_geometries(collection["features"],repair=False,rules=check_rules)
            print(json.dumps({"features_checked":len(collection["features"]),"invalid_geometry":geometry_summary["dropped"]},ensure_ascii=False,indent=2))
            if geometry_summary["dropped"]:raise SystemExit(1)
            return
        except (OSError,json.JSONDecodeError,ValueError) as exc:
            parser.error(f"cannot validate GeoJSON: {exc}")
    if not (args.fetch_osm or args.osm_json or args.gtfs_zip):
        parser.error("provide --fetch-osm, --osm-json, or --gtfs-zip; refusing an empty-source run")
    if args.osm_json and (not args.osm_source_url or not args.osm_retrieval_date):
        parser.error("--osm-json requires --osm-source-url and --osm-retrieval-date for provenance")
    if args.gtfs_zip and not args.gtfs_retrieval_date:
        parser.error("--gtfs-zip requires --gtfs-retrieval-date for provenance")
    try:
        osm_date = dt.date.fromisoformat(args.osm_retrieval_date).isoformat() if args.osm_retrieval_date else dt.date.today().isoformat()
        gtfs_date = dt.date.fromisoformat(args.gtfs_retrieval_date).isoformat() if args.gtfs_retrieval_date else dt.date.today().isoformat()
    except ValueError:
        parser.error("retrieval dates must use YYYY-MM-DD")
    outdir = Path(args.out)
    date = dt.date.today().isoformat()
    entities = load_entities()
    rules_path = Path(args.match_rules)
    rules = json.loads(rules_path.read_text(encoding="utf-8")) if rules_path.exists() else {}
    report = new_report()
    features: list[dict[str, Any]] = []
    source_results: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    road_network_manifest: dict[str, Any] = {}
    entity_map_manifest: dict[str, Any] = {}
    boundary_manifest: dict[str, Any] = {"available": False, "source_file": None, "feature_count": 0}
    boundaries_path = Path(args.boundaries_out)
    boundary_source_path = Path(args.osm_boundaries)
    combined_osm: dict[str, Any] | None = None
    station_matching_ran = False
    if args.fetch_osm or args.osm_json:
        input_files = args.osm_json or [None]
        osm_documents: list[dict[str, Any]] = []
        for input_name in input_files:
            try:
                osm = load_osm(argparse.Namespace(osm_json=input_name, fetch_osm=args.fetch_osm))
                osm_documents.append(osm)
                input_path = Path(input_name) if input_name else None
                source_results.append({"source": "OpenStreetMap", "url": args.osm_source_url or OVERPASS_URL,
                    "retrieval_date": osm_date, "retrieved_at": None, "input_file": input_path.name if input_path else None,
                    "input_sha256": hashlib.sha256(input_path.read_bytes()).hexdigest() if input_path else None,
                    "license": "ODbL-1.0", "elements_received": len(osm.get("elements", [])),
                    "timestamp_osm_base": osm.get("osm3s", {}).get("timestamp_osm_base")})
            except Exception as exc:
                failures.append({"source": f"OpenStreetMap Overpass API ({input_name or 'fetch'})", "error": str(exc)})
        if osm_documents:
            combined_osm = merge_osm_documents(osm_documents)
            features.extend(process_osm(combined_osm, entities, osm_date, report, rules))
            features.extend(process_advanced_osm(combined_osm, entities, osm_date, report, rules))
            station_line_features = list(features)
            if not args.gtfs_zip and (Path(args.out) / "features.geojson").exists():
                prior_collection = json.loads((Path(args.out) / "features.geojson").read_text(encoding="utf-8"))
                current_codes = {item["properties"]["code"] for item in station_line_features}
                station_line_features.extend(item for item in prior_collection.get("features", [])
                    if item.get("properties", {}).get("properties", {}).get("entity_type") == "transit_line"
                    and item.get("properties", {}).get("code") not in current_codes)
            station_features, station_audit = match_osm_station_nodes(combined_osm, entities, station_line_features, osm_date, rules)
            station_matching_ran = True
            features.extend(station_features)
            report["station_matching"] = station_audit
            entity_by_code = {entity["code"]: entity for entity in entities}
            for item in station_audit.get("source_node_audit", []):
                if item.get("outcome") == "unmatched" and not item.get("candidate_entity_codes"):
                    continue
                candidate_codes = item.get("candidate_entity_codes", [])
                candidate_types = {entity_by_code[code]["entity_type"] for code in candidate_codes if code in entity_by_code}
                kind = next(iter(candidate_types)) if len(candidate_types) == 1 else (
                    "rail_station" if item.get("station_modes") == ["train"] else "transit_stop")
                add_candidate(report, kind, f"node:{item['osm_id']}", " | ".join(item.get("source_labels", [])),
                              item["outcome"], candidate_codes, item.get("reason") or
                              ("; ".join(sorted(set(item.get("rejections", {}).values()))) if item.get("rejections") else None))
            road_network_manifest = build_road_network(combined_osm, Path(args.road_network_out), Path(args.road_network_detail_out))
    if boundary_source_path.exists():
        try:
            opener = gzip.open if boundary_source_path.suffix == ".gz" else open
            with opener(boundary_source_path, "rt", encoding="utf-8") as boundary_stream:
                boundary_osm = json.load(boundary_stream)
            point_features = list(features)
            prior_features_path = Path(args.out) / "features.geojson"
            if prior_features_path.exists():
                prior_collection = json.loads(prior_features_path.read_text(encoding="utf-8"))
                area_codes = {entity["code"] for entity in entities
                              if entity.get("entity_type") in {"city", "district", "neighborhood", "authority", "governorate"}}
                point_features.extend(item for item in prior_collection.get("features", [])
                    if item.get("properties", {}).get("entity_code") in area_codes
                    and item.get("geometry", {}).get("type") == "Point")
            boundary_features, boundary_audit = process_osm_boundaries(
                boundary_osm, entities, osm_date, rules, existing_features=point_features)
            boundaries_path.parent.mkdir(parents=True, exist_ok=True)
            boundaries_path.write_text(json.dumps({"type": "FeatureCollection", "features": boundary_features},
                                                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            boundary_manifest = {"available": True, "source_file": str(boundary_source_path),
                                "sha256_gzip": hashlib.sha256(boundary_source_path.read_bytes()).hexdigest(),
                                "sha256_original_json": sha256_uncompressed_json(boundary_source_path),
                                "timestamp_osm_base": boundary_osm.get("osm3s", {}).get("timestamp_osm_base"),
                                "elements_received": len(boundary_osm.get("elements", [])),
                                "extract_inventory_actual": new_extract_inventory(boundary_osm),
                                "feature_count": len(boundary_features), **boundary_audit}
            matching_sources = [source for source in source_results if source.get("input_file") == boundary_source_path.name]
            if matching_sources:
                for source in matching_sources:
                    source["sha256_original_json"] = boundary_manifest["sha256_original_json"]
                    source["also_used_for"] = ["station nodes", "Regional Ring road patch", "area boundaries"]
            else:
                source_results.append({"source": "OpenStreetMap area boundaries", "url": args.osm_source_url or OVERPASS_URL,
                                       "retrieval_date": osm_date, "input_file": boundary_source_path.name,
                                       "input_sha256": boundary_manifest["sha256_gzip"],
                                       "sha256_original_json": boundary_manifest["sha256_original_json"],
                                       "license": "ODbL-1.0",
                                       "elements_received": len(boundary_osm.get("elements", []))})
        except Exception as exc:
            boundary_manifest = {"available": False, "source_file": str(boundary_source_path),
                                "error": str(exc), "preserved_previous_output": boundaries_path.exists()}
            failures.append({"source": "OpenStreetMap area boundaries", "error": str(exc)})
    elif not boundaries_path.exists():
        boundaries_path.parent.mkdir(parents=True, exist_ok=True)
        boundaries_path.write_text(json.dumps({"type": "FeatureCollection", "features": []},
                                               ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if boundaries_path.exists() and not boundary_manifest.get("available"):
        try:
            old_boundary_data = json.loads(boundaries_path.read_text(encoding="utf-8"))
            boundary_manifest["feature_count"] = len(old_boundary_data.get("features", []))
            boundary_manifest["preserved_previous_output"] = True
        except (OSError, json.JSONDecodeError, AttributeError):
            boundary_manifest["preserved_previous_output"] = False
    if args.gtfs_zip:
        try:
            features.extend(process_gtfs(Path(args.gtfs_zip), entities, gtfs_date, args.gtfs_license, args.gtfs_license_evidence_url, report))
            source_results.append({"source": "Transport for Cairo GTFS via Transport Data Commons", "url": args.gtfs_license_evidence_url, "retrieval_date": gtfs_date, "retrieved_at": None, "file": Path(args.gtfs_zip).name, "license": "CC-BY-4.0"})
        except Exception as exc:
            failures.append({"source": "Transport for Cairo GTFS via Transport Data Commons", "error": str(exc)})
    # Preserve already licensed rail/transit features when this run supplies only the geometry extracts
    # and no replacement GTFS/transport source; this phase does not invalidate those earlier matches.
    if not args.gtfs_zip and (Path(args.out) / "features.geojson").exists():
        previous = json.loads((Path(args.out) / "features.geojson").read_text(encoding="utf-8"))
        current_codes = {f["properties"]["code"] for f in features}
        for old_feature in previous.get("features", []):
            props = old_feature.get("properties", {}).get("properties", {})
            if station_matching_ran and props.get("entity_type") in {"transit_stop", "rail_station"}:
                continue
            if props.get("entity_type") in {"transit_line", "transit_stop", "rail_station"} and old_feature.get("properties", {}).get("code") not in current_codes:
                features.append(old_feature)

    # Later advanced-OSM results carry route/gap-fill provenance and should override the legacy duplicate.
    features = list({f["properties"]["code"]: f for f in features}.values())
    features, geometry_summary = validate_feature_geometries(features, repair=True, rules=rules)
    report["geometry_repairs"] = geometry_summary["repairs"]
    report["invalid_geometry"] = geometry_summary["dropped"]

    # Dedupe overlapping objects across the two submitted extracts and choose the strongest outcome.
    priority = {"matched": 2, "ambiguous": 1, "unmatched": 0}
    unique_outcomes = {}
    for outcome in report.pop("_outcomes", []):
        key = (outcome["entity_type"], outcome["source_id"])
        if key not in unique_outcomes or priority[outcome["outcome"]] > priority[unique_outcomes[key]["outcome"]]:
            unique_outcomes[key] = outcome
    report["by_type"] = {t:{k:0 for k in ("matched","unmatched","ambiguous")} for t in report["by_type"]}
    report["unmatched"], report["ambiguous"] = [], []
    for outcome in unique_outcomes.values():
        report["by_type"][outcome["entity_type"]][outcome["outcome"]] += 1
        if outcome["outcome"] != "matched":
            report["unmatched" if outcome["outcome"] == "unmatched" else "ambiguous"].append({k:v for k,v in outcome.items() if k!="outcome"})
    # Identical OSM objects can occur in both submitted extracts; retain one stable geometry.
    features.sort(key=lambda f: f["properties"]["code"])
    codes = [f["properties"]["code"] for f in features]
    if len(codes) != len(set(codes)):
        raise SystemExit("Duplicate output feature codes; nothing written.")
    outdir.mkdir(parents=True, exist_ok=True)
    feature_file = outdir / "features.geojson"
    feature_count = len(features)
    previous_feature_collection = json.loads(feature_file.read_text(encoding="utf-8")) if feature_file.exists() else {"features": []}
    previous_features = previous_feature_collection.get("features", [])
    if not (failures and not source_results):
        feature_file.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        entity_map_manifest = build_entity_map_geometries(features, Path(args.entity_map_out))
    elif feature_file.exists():
        # A fully failed source run must never replace a previously curated collection.
        try:
            previous = json.loads(feature_file.read_text(encoding="utf-8"))
            feature_count = len(previous.get("features", []))
        except (OSError, json.JSONDecodeError, AttributeError):
            features_written = 0
    # Entity target denominators are explicit; no source item is represented as a match without source data.
    target_types = {"road": "road", "transit_line": "transit_line", "transit_stop": "transit_stop", "rail_station": "rail_station"}
    target_types.update({key:key for key in ("city","district","airport","bridge","landmark")})
    report["candidate_entities"] = {key: sum(1 for e in entities if e["entity_type"] == value) for key, value in target_types.items()}
    report["road_name_search_audit"] = road_name_search_audit(combined_osm or {"elements": []}, entities, rules, features)
    before_counts = defaultdict(int)
    for item in previous_features:
        before_counts[item.get("properties", {}).get("entity_code", "")] += 1
    after_counts = defaultdict(int)
    for item in features: after_counts[item["properties"]["entity_code"]] += 1
    station_audit = report.get("station_matching")
    if station_audit:
        for code, station_entity in station_audit.get("station_entities", {}).items():
            station_entity["feature_count_before"] = before_counts[code]
            station_entity["feature_count_after"] = after_counts[code]
        for summary in station_audit.get("by_line", {}).values():
            entity_codes = set(summary.get("matched_entity_codes", [])) | set(summary.get("unmatched_entities", []))
            summary["station_feature_count_before"] = sum(before_counts[code] for code in entity_codes)
            summary["station_feature_count_after"] = sum(after_counts[code] for code in entity_codes)
        station_status_counts = Counter(entity.get("status", "unknown") for entity in entities
                                        if entity.get("entity_type") in {"transit_stop", "rail_station"}
                                        and entity.get("code", "").startswith(("STOP-", "RAIL-")))
        station_audit["seed_station_entity_count"] = len(station_audit.get("station_entities", {}))
        station_audit["seed_status_counts"] = dict(sorted(station_status_counts.items()))
        station_audit["station_features_before"] = sum(before_counts[code] for code in station_audit.get("station_entities", {}))
        station_audit["station_features_after"] = sum(after_counts[code] for code in station_audit.get("station_entities", {}))
        station_audit["station_entities_with_geometry_before"] = sum(before_counts[code] > 0 for code in station_audit.get("station_entities", {}))
        station_audit["station_entities_with_geometry_after"] = sum(after_counts[code] > 0 for code in station_audit.get("station_entities", {}))
        station_audit["station_entities_matched"] = sum(item.get("matched_count", 0) > 0 for item in station_audit.get("station_entities", {}).values())
    report["feature_counts_before_after_by_entity"] = {e["code"]:{"before":before_counts[e["code"]],"after":after_counts[e["code"]]} for e in entities}
    report["entities_with_geometry"] = {"count":sum(v>0 for v in after_counts.values()),"total_entities":len(entities),"entity_codes":sorted(after_counts)}
    def entity_extent(items: list[dict[str, Any]], entity_code: str) -> list[float] | None:
        geometries = []
        for feature_item in items:
            if feature_item.get("properties", {}).get("entity_code") != entity_code:
                continue
            try:
                geometries.append(shape(feature_item["geometry"]))
            except Exception:
                continue
        return list(unary_union(geometries).bounds) if geometries else None
    scope_codes = ["ROAD-AHMED-ORABI", "ROAD-AMR-IBN-ALAS", "ROAD-MOHAMED-NAGUIB",
                   "ROAD-ASSAR-AXIS", "ROAD-AIN-SOKHNA", "ROAD-CORNICHE"]
    report["road_scope_extent_review"] = {code: {
        "before_wgs84": entity_extent(previous_features, code),
        "after_wgs84": entity_extent(features, code),
        "before_feature_count": before_counts[code], "after_feature_count": after_counts[code],
    } for code in scope_codes}
    report["source_results"] = source_results
    report["source_failures"] = failures
    report["area_boundaries"] = boundary_manifest
    report["boundary_match_counts_by_type"] = boundary_manifest.get("entity_counts_by_type", {})
    report["road_bbox_overrides_by_entity"] = {
        code: rule["road_bbox_wgs84"] for code, rule in rules.get("entity_rules", {}).items()
        if isinstance(rule, dict) and rule.get("road_bbox_wgs84")
    }
    report["bbox_wgs84"] = list(BBOX)
    report["road_bbox_wgs84"] = list(ROAD_BBOX)
    # Quantify the road-only envelope experiment against the previous common envelope.
    old_road_area = box(*BBOX)
    extended_road_area = box(*ROAD_BBOX)
    north_only_area = box(ROAD_BBOX[0], ROAD_BBOX[1], ROAD_BBOX[2], ROAD_BBOX[3]).difference(
        box(ROAD_BBOX[0], ROAD_BBOX[1], ROAD_BBOX[2], BBOX[3]))
    extension_features = 0
    extension_length_km = 0.0
    north_features = 0
    north_length_km = 0.0
    for feature_item in features:
        props = feature_item.get("properties", {})
        metadata = props.get("properties", {}) if isinstance(props, dict) else {}
        if not isinstance(metadata, dict) or metadata.get("entity_type") != "road":
            continue
        try:
            geom = shape(feature_item["geometry"])
            delta = geom.intersection(extended_road_area).difference(old_road_area)
            delta_parts = lineal_parts(delta)
            delta_length = sum(haversine_km(a, b) for part in delta_parts for a, b in zip(list(part.coords), list(part.coords)[1:]))
            if delta_length > 0:
                extension_features += 1
                extension_length_km += delta_length
            north_delta = geom.intersection(north_only_area)
            north_parts = lineal_parts(north_delta)
            north_length = sum(haversine_km(a, b) for part in north_parts for a, b in zip(list(part.coords), list(part.coords)[1:]))
            if north_length > 0:
                north_features += 1
                north_length_km += north_length
        except Exception:
            continue
    report["road_bbox_extension_impact"] = {
        "previous_bbox_wgs84": list(BBOX), "road_bbox_wgs84": list(ROAD_BBOX),
        "road_features_with_geometry_in_new_area": extension_features,
        "road_length_km_in_new_area": round(extension_length_km, 3),
        "north_extension_only": {"south_edge": BBOX[3], "north_edge": ROAD_BBOX[3],
                                  "features": north_features, "length_km": round(north_length_km, 3)},
        "dropped_fragments_under_300m": len(report.get("dropped_road_fragments_under_300m", [])),
    }
    report["features_written"] = feature_count
    report["features_by_entity"] = {code: sum(1 for f in features if f["properties"]["entity_code"] == code) for code in sorted({f["properties"]["entity_code"] for f in features})}
    report["road_gap_fill_totals"] = {
        "gaps_before": sum(item.get("gaps_before", 0) for item in report["road_gap_fill_by_entity"]),
        "gaps_after": sum(item.get("gaps_after", 0) for item in report["road_gap_fill_by_entity"]),
        "gaps_closed": sum(item.get("gaps_closed", 0) for item in report["road_gap_fill_by_entity"]),
        "topology_gaps": len(report["road_topology_gaps"]),
        "network_gaps": sum(gap.get("gap_type") == "network_gap" for gap in report["road_gaps"]),
        "source_clipped_edges": sum(gap.get("gap_type") == "source_clipped_edge" for gap in report["road_gaps"]),
        "km_closed": round(sum(item.get("km_closed", 0.0) for item in report["road_gap_fill_by_entity"]), 3),
    }
    report["road_network_context"] = road_network_manifest
    report["entity_page_map_geometries"] = entity_map_manifest
    report["rejected_road_segments"] = list({(g["source_id"],g["entity_code"]):g for g in report.get("rejected_road_segments",[])}.values())
    report["ملخص_05_5"] = {
        "فجوات_كل_طريق_قبل_وبعد_والكيلومترات_المغلقة": [{
            "رمز_الكيان": item["entity_code"], "الاسم_العربي": item.get("entity_name_ar"),
            "الاسم_الإنجليزي": item.get("entity_name_en"), "الفجوات_قبل": item.get("gaps_before", 0),
            "الفجوات_بعد": item.get("gaps_after", 0), "الفجوات_المغلقة": item.get("gaps_closed", 0),
            "الكيلومترات_المغلقة": item.get("km_closed", 0.0), "الفجوات_المتبقية_مع_الإحداثيات": item.get("unresolved_gaps", []),
        } for item in report["road_gap_fill_by_entity"]],
        "إجمالي_ميزات_الكيانات_بعد_التحديث": feature_count,
        "الكيانات_المطابقة_بعلاقات_طريق_OSM": report["road_route_entities"],
        "عدد_ميزات_شبكة_السياق_غير_الكيانية": road_network_manifest.get("feature_count", 0),
    }
    report["ملخص_05_4"] = {
        "عدد_الميزات_لكل_كيان_قبل_وبعد": report["feature_counts_before_after_by_entity"],
        "الكيانات_ذات_الهندسة_من_إجمالي_342": {"العدد":report["entities_with_geometry"]["count"],"الإجمالي":len(entities)},
        "فجوات_الطرق_المتبقية_مع_نقاط_النهاية": report["road_gaps"],
        "الطرق_المرفوضة_دون_اختلاق_وصلات": report["rejected_road_segments"],
        "العناصر_غير_المطابقة": report["unmatched"],
        "العناصر_الملتبسة": report["ambiguous"],
        "الهندسات_التي_تم_إصلاحها": {"العدد":len(report["geometry_repairs"]),"حسب_الكيان":dict(Counter(x["entity_code"] for x in report["geometry_repairs"])),"التفاصيل":report["geometry_repairs"]},
        "الهندسات_التي_تم_إسقاطها": {"العدد":len(report["invalid_geometry"]),"حسب_الكيان":dict(Counter(x["entity_code"] for x in report["invalid_geometry"])),"التفاصيل":report["invalid_geometry"]},
    }
    report["retrieval_date"] = date
    arabic_lines = [
        "# تقرير PHASE 05.5 — استمرارية هندسة الطرق",
        "",
        f"تاريخ التشغيل: {date}. المصدر: مستخلصات OpenStreetMap المخزنة (الأول وextract2 وroads-full)، بترخيص ODbL-1.0. لم تُنشأ وصلات هندسية اصطناعية.",
        "",
        f"- إجمالي ميزات الكيانات بعد التحديث: **{feature_count}** (شبكة السياق غير محتسبة ضمنها).",
        f"- إجمالي الفجوات: **{report['road_gap_fill_totals']['gaps_before']}** قبل، **{report['road_gap_fill_totals']['gaps_after']}** بعد؛ أُغلقت **{report['road_gap_fill_totals']['gaps_closed']}** بمسارات OSM حقيقية بطول **{report['road_gap_fill_totals']['km_closed']:.3f} كم**. من المتبقي **{report['road_gap_fill_totals']['topology_gaps']}** فجوة طوبولوجية (`osm_topology_gap`, أقل من 25 م ولا تُملأ) و**{report['road_gap_fill_totals']['network_gaps']}** فجوات شبكة.",
        ("- أُغلقت حافة الإقليمي الغربية عند `(30.5148, 29.7646)` بطرق OSM جديدة تمتد غرب lon 30.5؛ أُزيل تصنيف المصدر المقطوع." if report.get("regional_ring_west_patch", {}).get("status") == "closed_by_new_osm_extract" else "- حافة الإقليمي الغربية عند `(30.5148, 29.7646)` ما زالت `source_clipped_edge`: `source clipped at lon 30.5`؛ لم تُحسب فجوة شبكة."),
        f"- ميزات شبكة السياق المنفصلة: {road_network_manifest.get('feature_count', 0)} مبسطة للمستويات المنخفضة و{road_network_manifest.get('detail_feature_count', 0)} للتكبير العالي.",
        "",
        "## نتيجة كل طريق",
        "",
        "| الطريق | قبل | بعد | أُغلقت | كم مغلقة | طوبولوجية <25م | شبكة |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for item in report["road_gap_fill_by_entity"]:
        arabic_lines.append(
            f"| {item.get('entity_name_ar') or item['entity_code']} (`{item['entity_code']}`) | {item.get('gaps_before', 0)} | {item.get('gaps_after', 0)} | {item.get('gaps_closed', 0)} | {item.get('km_closed', 0.0):.3f} | {sum(gap.get('gap_type') == 'osm_topology_gap' for gap in item.get('unresolved_gaps', []))} | {sum(gap.get('gap_type') == 'network_gap' for gap in item.get('unresolved_gaps', []))} |"
        )
    arabic_lines.extend(["", "## مراجعة نطاق المحاور ومكونات الطرق", ""])
    for code, review in report.get("road_scope_extent_review", {}).items():
        arabic_lines.append(f"- `{code}`: النطاق قبل `{review.get('before_wgs84')}` وبعد `{review.get('after_wgs84')}`؛ الميزات {review.get('before_feature_count')} ← {review.get('after_feature_count')}.")
    for item in report.get("urban_axis_component_filter", []):
        dropped_ids = sorted({way_id for component in item.get("components_dropped", []) for way_id in component.get("way_ids", [])})
        arabic_lines.append(f"- تصفية `{item['entity_code']}`: أُبقي أكبر مكوّن والمكونات ضمن {item['max_component_distance_km']:.1f} كم؛ أُسقطت {len(item.get('components_dropped', []))} مكونات غير متصلة، way IDs: `{dropped_ids}`.")
    if not report.get("urban_axis_component_filter"):
        arabic_lines.append("- لا توجد محاور حضرية عليها قاعدة تصفية المكونات في هذه الدورة.")
    arabic_lines.extend(["", "## الكيانات التي استخدمت علاقات OSM من النوع route=road", ""])
    if report["road_route_relations"]:
        for relation in report["road_route_relations"]:
            arabic_lines.append(
                f"- `{relation['entity_code']}` — relation/{relation['relation_id']}؛ {relation.get('name') or 'بلا اسم'}؛ ref: {relation.get('ref') or '—'}؛ {len(relation.get('member_way_ids', []))} مقطعًا عضوًا."
            )
    else:
        arabic_lines.append("- لا توجد علاقات مطابقة في المستخلصات.")
    arabic_lines.extend(["", "## الفجوات المتبقية وإحداثيات نهاياتها", ""])
    remaining = [(item, gap) for item in report["road_gap_fill_by_entity"] for gap in item.get("unresolved_gaps", [])]
    if remaining:
        for item, gap in remaining:
            if gap.get("gap_type") == "source_clipped_edge":
                arabic_lines.append(f"- `{item['entity_code']}` (`source_clipped_edge`): الطرف عند `{gap['coordinate_wgs84']}`؛ `source clipped at lon {gap['source_bbox_west_lon']}`؛ لذا هذه ليست فجوة شبكة؛ المستخلص الإضافي مطلوب.")
                continue
            a = gap.get("endpoint_a", {}).get("coordinates")
            b = gap.get("endpoint_b", {}).get("coordinates")
            reason = "فجوة طوبولوجية بين نهايتي طريق بلا عقدة OSM مشتركة؛ لم تُملأ" if gap.get("gap_type") == "osm_topology_gap" else f"لا يوجد مسار طرق مسموح ضمن حد {gap.get('max_graph_path_km', 0):.3f} كم"
            arabic_lines.append(f"- `{item['entity_code']}` ({gap.get('gap_type', 'network_gap')}): `{a}` ↔ `{b}`؛ المسافة المستقيمة {gap.get('straight_line_km', 0):.3f} كم؛ {reason}.")
    else:
        arabic_lines.append("- لا توجد فجوات متبقية بين مكونات الطرق المطابقة.")
    arabic_report_path = outdir / "phase-05-5-road-gap-report.ar.md"
    arabic_report_path.write_text("\n".join(arabic_lines) + "\n", encoding="utf-8")
    report["arabic_road_gap_report"] = str(arabic_report_path.relative_to(ROOT))
    station_audit = report.get("station_matching")
    if station_audit:
        station_lines = [
            "# تقرير PHASE 07.4 — الحدود والمحطات ومراجعة الطريق الإقليمي",
            "",
            f"- كيانات المحطات في البذرة: {station_audit.get('seed_station_entity_count', 0)}؛ الحالات: `{station_audit.get('seed_status_counts', {})}` (المطابق منها فعليًا: {station_audit.get('station_entities_matched', 0)}).",
            f"- ميزات نقاط المحطات: {station_audit.get('station_features_before', 0)} قبل → {station_audit.get('station_features_after', 0)} بعد؛ كيانات ذات هندسة: {station_audit.get('station_entities_with_geometry_before', 0)} → {station_audit.get('station_entities_with_geometry_after', 0)}.",
            f"- عُقد المحطات المفحوصة: {station_audit.get('source_station_nodes_examined', 0)}؛ ذات أسماء مرشحة في البذرة: {station_audit.get('source_nodes_with_seed_name_candidates', 0)}.",
            f"- العُقد المطابقة بعد فحوص الاسم والنوع والخط والحالة: {station_audit.get('matched_source_nodes', 0)}؛ الملتبسة: {station_audit.get('ambiguous_source_nodes', 0)}؛ المرفوضة: {station_audit.get('rejected_source_nodes', 0)}.",
            "- لا تُقبل المحطة إلا باسم/اسم بديل مطابق بعد التطبيع، ونوع نقل متوافق، وبُعد لا يتجاوز 600 م عن هندسة الخط المطابق عند توفرها. المحطات المخططة/قيد الإنشاء تتطلب وسم construction ومحاذاة خط متاحة.",
            "- عند وجود عقدة محطة أساسية عالية الجودة، تُستبعد عقدة stop-position/platform الأقل جودة كنسخة فقط إذا كانت ضمن 150 م؛ أما عقد التوقف المتعددة على الخطوط المختلفة أو البعيدة فتبقى منفصلة أو تُرفع للالتباس دون تخمين.",
            "",
            "| الخط / المجموعة | كيانات المحطات | كيانات مطابقة | ميزات قبل → بعد | كيانات بلا مطابقة |",
            "|---|---:|---:|---:|---:|",
        ]
        for line_code, detail in sorted(station_audit.get("by_line", {}).items()):
            station_lines.append(
                f"| `{line_code}` | {detail.get('station_entities', 0)} | {detail.get('matched_entities', 0)} | {detail.get('station_feature_count_before', 0)} → {detail.get('station_feature_count_after', 0)} | {len(detail.get('unmatched_entities', []))} |"
            )
            if detail.get("unmatched_entities"):
                station_lines.append(f"  - بلا مطابقة: `{', '.join(detail['unmatched_entities'])}`")
        station_lines.extend(["", "## الكيانات بلا مطابقة مؤكدة", ""])
        for code, detail in sorted(station_audit.get("station_entities", {}).items()):
            if detail.get("matched_count", 0):
                continue
            reasons = detail.get("rejected_candidates", [])
            reason_text = "; ".join(item.get("reason", "") for item in reasons if item.get("reason")) or "لا توجد عقدة OSM مؤهلة بالاسم والنوع والخط والحالة المطلوبة"
            station_lines.append(f"- `{code}`: لم تُضف هندسة؛ {reason_text}.")
        brt = station_audit.get("brt_round_two", {})
        station_lines.extend(["", "## محطات BRT", "",
            f"- كيانات BRT في البذرة: {brt.get('seed_brt_station_entities', 0)}؛ مطابقة: {brt.get('matched_brt_station_entities', 0)}؛ بلا مطابقة: {len(brt.get('unmatched_entity_codes', []))}.",
            f"- عقد OSM المسماة BRT/ترددي والموسومة `bus=yes`: {len(brt.get('source_named_bus_yes_brt_nodes', []))}."])
        if brt.get("matched_entity_codes"):
            station_lines.append(f"- كيانات مطابقة: `{', '.join(brt['matched_entity_codes'])}`.")
        if brt.get("unmatched_entity_codes"):
            station_lines.append(f"- بلا مطابقة مؤكدة: `{', '.join(brt['unmatched_entity_codes'])}`.")
        for node in brt.get("source_named_bus_yes_brt_nodes", []):
            station_lines.append(f"- OSM node/{node['osm_id']}: `{node.get('name') or node.get('name_ar') or node.get('name_en')}`؛ دون تعيين إلى كيان غير مطابق في البذرة ما لم توجد مطابقة اسمية مؤهلة.")
        multiple_node_entities = [(code, detail) for code, detail in sorted(station_audit.get("station_entities", {}).items())
                                  if detail.get("matched_count", 0) > 1]
        if multiple_node_entities:
            station_lines.extend(["", "## كيانات بمحطات OSM متعددة", "",
                                  "العُقد المتعددة هنا حُفظت فقط بعد مطابقة الاسم والخط والنوع؛ تظهر عدة محطات monorail بعقدتين منفصلتين موسومتين stop-position، كما تظهر مرافق التبادل على خطوط مختلفة مستقلة. لا تعني النقاط المزدوجة استنتاج اتجاه خدمة غير موثق."])
            for code, detail in multiple_node_entities:
                station_lines.append(f"- `{code}`: OSM node IDs `{detail.get('matched_osm_node_ids')}`؛ الخطوط `{detail.get('matched_line_codes')}`.")
        conflicts = station_audit.get("entity_level_conflicts", {})
        if conflicts:
            station_lines.extend(["", "## مواضع ملتبسة لم تُخَمَّن", ""])
            for code, conflict in sorted(conflicts.items()):
                station_lines.append(f"- `{code}`؛ OSM node IDs `{conflict.get('candidate_osm_node_ids')}`؛ أزواج متباعدة `{conflict.get('distant_pairs')}`. لم تُضف هندسة.")
        station_lines.extend(["", "## مطابقة الحدود حسب نوع الكيان", "",
                              "| النوع | الكيانات | مطابقة | بلا مطابقة | ملتبسة |", "|---|---:|---:|---:|---:|"])
        for entity_type, counts in sorted(boundary_manifest.get("entity_counts_by_type", {}).items()):
            station_lines.append(f"| `{entity_type}` | {counts.get('entities', 0)} | {counts.get('matched', 0)} | {counts.get('unmatched', 0)} | {counts.get('ambiguous', 0)} |")
        station_lines.append(f"- إجمالي مضلعات الحدود المختارة: {boundary_manifest.get('feature_count', 0)} من OSM؛ لم يُخمن أي مرشح متعادل الأولوية.")
        for code, conflict in sorted(boundary_manifest.get("ambiguous_entities", {}).items()):
            station_lines.append(f"- التباس `{code}`: OSM candidates `{conflict.get('candidate_osm_ids')}`؛ لم تُضف هندسة.")
        west_patch = report.get("regional_ring_west_patch", {})
        station_lines.extend(["", "## الطريق الدائري الإقليمي — الحافة الغربية", "",
            (f"- أُغلقت الحافة عند `(30.5148, 29.7646)` بطرق OSM جديدة؛ الحد الغربي الخاص بالكيان `{west_patch.get('road_bbox_wgs84')}`. لم تعد `source_clipped_edge` قائمة." if west_patch.get("status") == "closed_by_new_osm_extract" else
             f"- بقيت الحافة عند `(30.5148, 29.7646)` مقطوعة عند lon 30.5؛ لم تُسجّل كفجوة شبكة. النطاق الخاص `{west_patch.get('road_bbox_wgs84')}` لم يوفر اتصالًا مؤكدًا.")])
        regional_topology_gaps = [gap for gap in report.get("road_gaps", [])
                                  if gap.get("entity_code") == "ROAD-REGIONAL-RING" and gap.get("gap_type") == "osm_topology_gap"]
        if regional_topology_gaps:
            endpoints = [gap.get("endpoint_a", {}).get("coordinates") for gap in regional_topology_gaps]
            station_lines.append(f"- بقيت {len(regional_topology_gaps)} فجوة طوبولوجية منفصلة في الدائري الإقليمي عند endpoints `{endpoints}`؛ لا تتصل بالحافة الغربية القديمة المغلقة ولم تُملأ بخط اصطناعي.")
        station_report_path = outdir / "phase-07-4-boundary-station-report.ar.md"
        station_report_path.write_text("\n".join(station_lines) + "\n", encoding="utf-8")
        report["arabic_station_matching_report"] = str(station_report_path.relative_to(ROOT))
        report["arabic_boundary_matching_report"] = str(station_report_path.relative_to(ROOT))
        report["arabic_phase_07_4_report"] = str(station_report_path.relative_to(ROOT))
    (outdir / "match-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    raw_archives = []
    for basename in ("osm-overpass-2026-11-14.json", "cairo-osm-overpass-2026-11-14-extract2.json",
                     "cairo-osm-overpass-2026-11-14-roads-full.json", "cairo-osm-boundaries-2026-11-14.json"):
        archive = ROOT / "data/raw" / (basename + ".gz")
        raw_archives.append({"source_file": basename, "file": str(archive.relative_to(ROOT)),
                             "sha256_original_json": sha256_uncompressed_json(archive) if archive.exists() else None,
                             "sha256_gzip": hashlib.sha256(archive.read_bytes()).hexdigest() if archive.exists() else None,
                             "license": "ODbL-1.0"})
    manifest = {
        "title": "Greater Cairo Atlas geometry ingestion manifest", "retrieval_date": date,
        "bbox_wgs84": list(BBOX), "road_bbox_wgs84": list(ROAD_BBOX), "feature_count": feature_count,
        "sources": source_results, "source_failures": failures,
        "attribution": {"osm": OSM_ATTRIBUTION, "tfc": TFC_ATTRIBUTION},
        "license_policy": "OSM=ODbL-1.0; TfC GTFS accepted only when independently verified CC-BY-4.0. CC-BY-NC data is prohibited.",
        "matching": "Station points use normalized Arabic/English names and seed aliases, explicit station/railway modes or route-relation membership, and a 600 m matched-line guard where line geometry exists; ambiguous same-name nodes are reported rather than assigned. Road route relations are primary where exact name/ref matches exist. Gaps use real motorway/trunk/primary/secondary ways. Real *_link ways may be used only as shared-node paths joining components of the same entity within the configured distance; other named ways still require the same entity name/alias/ref. Sub-25 m endpoint pairs without a shared OSM node are reported as osm_topology_gap and are never snapped or filled. No synthetic connectors or entity creation.",
        "road_gap_fill": {"max_path_km_default": (rules or {}).get("road_gap_fill", {}).get("max_path_km", 3.0),
                          "summary": report["road_gap_fill_totals"], "by_entity": report["road_gap_fill_by_entity"],
                          "route_relation_entities": report["road_route_entities"], "route_relations": report["road_route_relations"]},
        "road_network_context_layer": road_network_manifest,
        "area_boundaries": boundary_manifest,
        "station_matching": report.get("station_matching"),
        "regional_ring_west_patch": report.get("regional_ring_west_patch"),
        "road_bbox_overrides_by_entity": report.get("road_bbox_overrides_by_entity", {}),
        "entity_page_map_geometries": entity_map_manifest,
        "arabic_road_gap_report": str(arabic_report_path.relative_to(ROOT)),
        "arabic_station_matching_report": report.get("arabic_station_matching_report"),
        "arabic_boundary_matching_report": report.get("arabic_boundary_matching_report"),
        "arabic_phase_07_4_report": report.get("arabic_phase_07_4_report"),
        "lifecycle_policy": "Operational/unknown station nodes require exact normalized seed/configured names and compatible mode/route evidence. Planned/under-construction station points require explicit OSM construction tags, matched non-planned official line geometry within 600 m, and compatible lifecycle; planned line geometry is never used. BRT geometry matches only existing STOP-BRT entities from bus=yes/route evidence. No station entity is inferred.",
        "geometry_policy": "WGS84 / SRID 4326; non-empty, GEOS-valid geometries are validated and repaired only when polygonal. Non-road features use bbox_wgs84; roads use their entity-specific road_bbox_wgs84 override when configured, otherwise the shared road envelope. The Regional Ring west patch is accepted only for ROAD-REGIONAL-RING. Every output geometry is checked with Shapely is_valid/explain_validity; degenerate lines and unrepaired/otherwise invalid geometries are dropped.",
        "geometry_validation": {"validator":f"Shapely {shapely.__version__}","db_constraint":"ST_SRID(geometry)=4326 AND NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry)","features_repaired_count":len(report["geometry_repairs"]),"features_dropped_count":len(report["invalid_geometry"]),"repairs":report["geometry_repairs"],"dropped":report["invalid_geometry"]},
        "osm_query_coverage": {
            "preserved_extracts": "Three prior owner-supplied extracts (first extract, extract2, roads-full) plus the new boundaries/stations/road-patch extract are deduplicated by OSM type/id, preferring current versions and most complete geometry. Route graph connectivity uses shared OSM node IDs, never coordinate snapping.",
            "new_extract": {
                "file": "data/raw/cairo-osm-boundaries-2026-11-14.json.gz",
                "timestamp_osm_base": boundary_manifest.get("timestamp_osm_base"),
                "elements": boundary_manifest.get("elements_received"),
                "license": "ODbL-1.0",
                "sha256_original_json": boundary_manifest.get("sha256_original_json"),
                "sha256_gzip": boundary_manifest.get("sha256_gzip"),
                "output": "out meta geom",
                "selectors": {
                    "administrative_relations": {"filter": "boundary=administrative AND admin_level in 4..10", "bbox_s_w_n_e": [29.2, 30.3, 30.95, 32.4]},
                    "place_relations_and_ways": {"filter": "place=city|town|suburb|quarter|neighbourhood", "bbox_s_w_n_e": [29.2, 30.3, 30.95, 32.4]},
                    "regional_ring_highway_ways": {"filter": "highway=motorway|trunk|primary|motorway_link|trunk_link|primary_link", "bbox_s_w_n_e": [29.5, 30.25, 30.15, 30.55]},
                    "regional_ring_route_relations": {"filter": "route=road AND ref=515"},
                    "transit_relations": {"filter": "route=monorail|bus|light_rail", "bbox_s_w_n_e": [29.7, 30.4, 30.7, 32.0]},
                    "station_and_bus_nodes": {"filter": "station=monorail|light_rail; monorail=yes; railway=station|halt|stop; public_transport=station; construction~station; bus=yes with BRT/ترددي names", "bbox_s_w_n_e": [29.7, 30.4, 30.7, 32.0]}
                },
                "reported_contents": {
                    "place_neighbourhood_ways": 5569, "place_city_ways": 16, "place_town_ways": 11, "place_suburb_ways": 9,
                    "administrative_relations_by_level": {"4": 14, "7": 2, "8": 2, "9": 6, "10": 1},
                    "monorail_route_relations": 4, "railway_station_nodes": 175, "railway_stop_nodes": 276,
                    "public_transport_station_nodes": 85, "railway_halt_nodes": 19, "railway_construction_nodes": 16
                },
                "decoded_source_inventory": boundary_manifest.get("extract_inventory_actual", {}),
                "count_note": "reported_contents preserves the fetcher's supplied summary verbatim; decoded_source_inventory records independent counts over this stored 6,851-element file. Differences are retained transparently rather than silently reconciled."
            },
            "geometry_acceptance": {"general_road_bbox_wgs84": list(ROAD_BBOX),
                                     "entity_specific_road_bbox_overrides": report.get("road_bbox_overrides_by_entity", {}),
                                     "dropped_disconnected_fragments_under_m": 300,
                                     "regional_ring_west_patch": report.get("regional_ring_west_patch")}
        },
        "match_rules_file": "match-rules.json",
        "raw_extracts": raw_archives
    }
    (outdir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"features_written": feature_count, "by_type": report["by_type"], "candidate_entities": report["candidate_entities"], "source_failures": failures}, ensure_ascii=False, indent=2))
    if failures:
        print("One or more sources were unavailable/rejected. No unsupported geometry was fabricated.", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
