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
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, box, mapping, shape
from shapely.validation import explain_validity

ROOT = Path(__file__).resolve().parents[1]
ENTITIES = ROOT / "data/seed/entities.csv"
OUT = ROOT / "data/features"
# Conservative Greater Cairo envelope [west, south, east, north], WGS84.
BBOX = (30.5, 29.2, 32.1, 30.8)
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
    def positions(value: Any):
        if isinstance(value, list) and len(value) >= 2 and all(isinstance(x, (int, float)) for x in value[:2]):
            yield value
        elif isinstance(value, list):
            for item in value:
                yield from positions(item)
    coords = geometry.get("coordinates", [])
    points = list(positions(coords))
    return bool(points) and all(BBOX[0] <= p[0] <= BBOX[2] and BBOX[1] <= p[1] <= BBOX[3] for p in points)


def polygonal_parts(geometry: Any) -> list[Polygon]:
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    if isinstance(geometry, GeometryCollection):
        return [polygon for part in geometry.geoms for polygon in polygonal_parts(part)]
    return []


def validate_feature_geometries(features: list[dict[str, Any]], *, repair: bool) -> tuple[list[dict[str, Any]], dict[str, Any]]:
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
        if not cairo_bbox.covers(geom):
            reject(item, "geometry_outside_greater_cairo_bbox")
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
        if item["type"] == "node" and (tags.get("public_transport") or tags.get("railway") in {"station", "halt"}):
            etype, match_type = ("rail_station" if tags.get("railway") in {"station", "halt"} and tags.get("railway") else "transit_stop"), ("rail_station" if tags.get("railway") in {"station", "halt"} and tags.get("railway") else "transit_stop")
            geom = {"type": "Point", "coordinates": [item.get("lon"), item.get("lat")]}
        elif item["type"] == "way" and tags.get("highway") in {"motorway", "trunk", "primary", "secondary"}:
            etype, match_type = "road", "road"
            coords = [[p["lon"], p["lat"]] for p in item.get("geometry", []) if "lon" in p and "lat" in p]
            geom = {"type": "LineString", "coordinates": coords}
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
        ident = f"{item['type']}:{item['id']}"
        if len(matches) == 1:
            rule = entity_rules.get(matches[0], {})
            if rule.get("enabled") is False:
                add_candidate(report, match_type, ident, " | ".join(labels), "ambiguous", matches,
                              rule.get("reason", "entity disabled by match rule"))
                continue
            rule_bbox = rule.get("bbox_wgs84")
            if rule_bbox:
                def inside_rule_bbox(value: Any) -> bool:
                    if isinstance(value, list) and len(value) >= 2 and all(isinstance(x, (int, float)) for x in value[:2]):
                        return rule_bbox[0] <= value[0] <= rule_bbox[2] and rule_bbox[1] <= value[1] <= rule_bbox[3]
                    return all(inside_rule_bbox(child) for child in value) if isinstance(value, list) else True
                if not inside_rule_bbox(geom.get("coordinates", [])):
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
    elements = data.get("elements", [])
    by_key = {(x.get("type"), x.get("id")): x for x in elements}
    out: list[dict[str, Any]] = []
    used: set[tuple[str, int, str]] = set()
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
             tags: dict[str, Any], extra: dict[str, Any] | None = None) -> bool:
        entity=by_code[entity_code]
        rule=entity_rules.get(entity_code,{})
        if rule.get("enabled") is False:return False
        if entity.get("status") in {"planned","approved_planned","under_construction"}:return False
        if not in_bbox(geom):return False
        version=int(item.get("version",0) or 0)
        if version<1:return False
        code=f"OSM-{item['type'].upper()}-{int(item['id'])}"
        if code in used:return True
        props={"osm_type":item["type"],"osm_id":int(item["id"]),"osm_version":version}
        out.append(feature(code,entity,geom,"ODbL-1.0",OSM_ATTRIBUTION,"OpenStreetMap",props,date,
                           {"entity_type":kind,"osm_tags":tags,**(extra or {})}))
        used.add(code)
        return True

    # Route relations take precedence for road geometry; only exact existing road names/ref match.
    for item in elements:
        tags=item.get("tags",{})
        if item.get("type")!="relation" or tags.get("route") not in {"road","道路"}:continue
        relation_labels=labels_for(tags,("name","ref"))
        matches=exact_match(idx,"road",relation_labels)
        if len(matches)!=1:continue
        matched_road_relations.append((item,matches))
        for member in item.get("members",[]):
            if member.get("type")=="way":road_rel_members[("way",int(member["ref"]))].add(matches[0])

    road_lines: dict[str,list[list[list[float]]]]=defaultdict(list)
    unmatched_road_segments=[]

    grid_size=0.00012
    segment_grid: dict[tuple[int,int],list[tuple[str,list[list[float]],int,list[float],list[float]]]]=defaultdict(list)

    def cell(point: list[float]) -> tuple[int,int]:
        return math.floor(point[0]/grid_size),math.floor(point[1]/grid_size)

    def index_road_line(entity_code: str,line: list[list[float]]) -> None:
        for index,(a,b) in enumerate(zip(line,line[1:])):
            x0,y0=cell(a);x1,y1=cell(b)
            for x in range(min(x0,x1)-1,max(x0,x1)+2):
                for y in range(min(y0,y1)-1,max(y0,y1)+2):
                    segment_grid[(x,y)].append((entity_code,line,index,a,b))

    def adjacent_roads(point: list[float],entity_code: str|None=None,exclude_line: list[list[float]]|None=None) -> set[str]:
        x,y=cell(point);found=set();seen=set()
        for gx in range(x-1,x+2):
            for gy in range(y-1,y+2):
                for code,line,index,a,b in segment_grid.get((gx,gy),[]):
                    if entity_code is not None and code!=entity_code:continue
                    if exclude_line is line:continue
                    key=(code,id(line),index)
                    if key in seen:continue
                    seen.add(key)
                    dx,dy=b[0]-a[0],b[1]-a[1];denom=dx*dx+dy*dy
                    t=0.0 if denom==0 else max(0.0,min(1.0,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/denom))
                    if math.hypot(point[0]-(a[0]+t*dx),point[1]-(a[1]+t*dy))<=grid_size:found.add(code)
        return found

    # Process ordinary road ways before ramps so link matching is independent of extract ordering.
    for item in sorted(elements,key=lambda x:str(x.get("tags",{}).get("highway"," ")).endswith("_link")):
        tags=item.get("tags",{})
        if item.get("type")!="way":continue
        key=("way",int(item["id"]))
        assigned_from_relation=sorted(road_rel_members.get(key,set()))
        if not tags.get("highway") and not assigned_from_relation:continue
        # A *_link is accepted only if an endpoint connects to a named, already-matched parent road.
        is_link=str(tags.get("highway","")).endswith("_link")
        coords=[[p["lon"],p["lat"]] for p in item.get("geometry",[]) if "lon" in p and "lat" in p]
        if len(coords)<2:continue
        geom={"type":"LineString","coordinates":coords}
        assigned=sorted(road_rel_members.get(key,set()))
        source="road route relation member"
        if not assigned:
            road_names=labels_for(tags,("name","name:ar","name:en","ref","old_name","alt_name"))
            assigned=exact_match(idx,"road",road_names)
            source="exact road name/alias"
            if is_link and not assigned:
                endpoints=[coords[0],coords[-1]]
                connected_entities=sorted({code for endpoint in endpoints for code in adjacent_roads(endpoint)})
                if len(connected_entities)==1:
                    assigned=connected_entities
                    source="unnamed ramp connected to exactly one matched road"
                elif len(connected_entities)>1:
                    add_candidate(report,"road",f"way:{item['id']}"," | ".join(road_names),"ambiguous",connected_entities,"ramp is adjacent to multiple matched roads")
                    continue
        if len(assigned)!=1:
            if assigned: add_candidate(report,"road",f"way:{item['id']}"," | ".join(labels_for(tags,("name","name:ar","name:en","ref"))),"ambiguous",assigned,"road name/ref is not unique")
            continue
        if is_link:
            endpoints=[coords[0],coords[-1]]
            connected=any(assigned[0] in adjacent_roads(endpoint,assigned[0]) for endpoint in endpoints)
            if not connected:continue
        rule=entity_rules.get(assigned[0],{})
        if rule.get("enabled") is False:continue
        if emit(item,assigned[0],"road",geom,tags,{"road_geometry_match":source}):
            road_lines[assigned[0]].append(coords)
            index_road_line(assigned[0],coords)
            add_candidate(report,"road",f"way:{item['id']}"," | ".join(labels_for(tags,("name","name:ar","name:en","ref"))),"matched",assigned)
        else:
            if by_code[assigned[0]].get("status") not in {"planned","approved_planned","under_construction"}:
                unmatched_road_segments.append({"source_id":f"way:{item['id']}","entity_code":assigned[0],"name":tags.get("name") or tags.get("name:ar") or tags.get("ref"),"endpoints":[coords[0],coords[-1]],"reason":"bbox, lifecycle, lineage, or existing match rule rejected geometry"})

    # One report item per matched route relation; all its member ways already emitted above.
    for relation,matches in matched_road_relations:
        add_candidate(report,"road",f"relation:{relation['id']}"," | ".join(labels_for(relation.get("tags",{}),("name","ref"))),"matched",matches)

    # Named administrative polygons/place nodes, aerodromes, bridges and landmarks.
    for item in elements:
        typ=item.get("type"); tags=item.get("tags",{})
        kind=None; geom=None; match_values=[]
        if tags.get("boundary")=="administrative":
            kind="city" if tags.get("admin_level") in {"7","8"} else "district"
            match_values=labels_for(tags,("name","name:ar","name:en","official_name","alt_name"))
            geom=relation_polygon(item) if typ=="relation" else coordinate_geometry(item,True)
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

    # No connectors are fabricated: list open line endpoints as explicit unresolved gaps.
    gaps=[]
    for entity_code,lines in sorted(road_lines.items()):
        for line in lines:
            for side,pt in (("start",line[0]),("end",line[-1])):
                if not adjacent_roads(pt,entity_code,exclude_line=line):
                    gaps.append({"entity_code":entity_code,"endpoint":pt,"reason":"unconnected OSM line endpoint; no connector generated"})
    report.setdefault("road_gaps",[]).extend(gaps)
    report.setdefault("rejected_road_segments",[]).extend(unmatched_road_segments)
    return out


def new_report():
    types=("road","transit_line","transit_stop","rail_station","city","district","airport","bridge","landmark")
    return {"by_type": {t: {k: 0 for k in ("matched", "unmatched", "ambiguous")} for t in types}, "unmatched": [], "ambiguous": [], "road_gaps": [], "rejected_road_segments": [], "geometry_repairs": [], "invalid_geometry": []}


def load_osm(args) -> dict[str, Any]:
    if args.osm_json:
        return json.loads(Path(args.osm_json).read_text(encoding="utf-8"))
    if not args.fetch_osm:
        return {"elements": []}
    req = urllib.request.Request(OVERPASS_URL, data=urllib.parse.urlencode({"data": overpass_query()}).encode(), headers={"User-Agent": "GreaterCairoAtlas/0.1 (offline feature ingestion)"})
    with urllib.request.urlopen(req, timeout=240) as response:
        return json.loads(response.read())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--osm-json", action="append", help="Previously downloaded Overpass JSON extract (repeatable)")
    parser.add_argument("--osm-source-url", help="Original OSM extract URL when using --osm-json")
    parser.add_argument("--osm-retrieval-date", help="ISO date the supplied OSM extract was retrieved")
    parser.add_argument("--fetch-osm", action="store_true", help="Fetch matching objects from Overpass now")
    parser.add_argument("--gtfs-zip", help="TfC GTFS zip from the Transport Data Commons release")
    parser.add_argument("--gtfs-retrieval-date", help="ISO date the supplied GTFS archive was retrieved")
    parser.add_argument("--gtfs-license", help="Must explicitly be CC-BY-4.0; CC-BY-NC is rejected")
    parser.add_argument("--gtfs-license-evidence-url", help="Exact Transport Data Commons dataset page documenting CC-BY-4.0")
    parser.add_argument("--match-rules", default=str(OUT / "match-rules.json"), help="Optional per-entity OSM match rules JSON")
    parser.add_argument("--out", default=str(OUT))
    parser.add_argument("--check-geojson", help="Validate an existing GeoJSON feature collection against PostGIS geometry rules without modifying it")
    args = parser.parse_args()
    if args.check_geojson:
        try:
            collection=json.loads(Path(args.check_geojson).read_text(encoding="utf-8"))
            if not isinstance(collection,dict) or collection.get("type")!="FeatureCollection" or not isinstance(collection.get("features"),list):
                raise ValueError("expected a GeoJSON FeatureCollection")
            _, geometry_summary=validate_feature_geometries(collection["features"],repair=False)
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
    if args.fetch_osm or args.osm_json:
        input_files = args.osm_json or [None]
        for input_name in input_files:
            try:
                osm = load_osm(argparse.Namespace(osm_json=input_name, fetch_osm=args.fetch_osm))
                features.extend(process_osm(osm, entities, osm_date, report, rules))
                features.extend(process_advanced_osm(osm, entities, osm_date, report, rules))
                input_path = Path(input_name) if input_name else None
                source_results.append({"source": "OpenStreetMap", "url": args.osm_source_url or OVERPASS_URL,
                    "retrieval_date": osm_date, "retrieved_at": None, "input_file": input_path.name if input_path else None,
                    "input_sha256": hashlib.sha256(input_path.read_bytes()).hexdigest() if input_path else None,
                    "license": "ODbL-1.0", "elements_received": len(osm.get("elements", [])),
                    "timestamp_osm_base": osm.get("osm3s", {}).get("timestamp_osm_base")})
            except Exception as exc:
                failures.append({"source": f"OpenStreetMap Overpass API ({input_name or 'fetch'})", "error": str(exc)})
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
            if props.get("entity_type") in {"transit_line", "transit_stop", "rail_station"} and old_feature.get("properties", {}).get("code") not in current_codes:
                features.append(old_feature)

    features = list({f["properties"]["code"]: f for f in reversed(features)}.values())
    features, geometry_summary = validate_feature_geometries(features, repair=True)
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
    if not (failures and not source_results):
        feature_file.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
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
    previous_features = json.loads((outdir / "features.geojson").read_text(encoding="utf-8")) if (outdir / "features.geojson").exists() else {"features": []}
    before_counts = defaultdict(int)
    prior_report_path = outdir / "match-report.json"
    prior_report = json.loads(prior_report_path.read_text(encoding="utf-8")) if prior_report_path.exists() else {}
    prior_delta = prior_report.get("feature_counts_before_after_by_entity", {})
    if prior_delta:
        for code, counts in prior_delta.items(): before_counts[code] = counts.get("before", 0)
    else:
        for item in previous_features.get("features", []): before_counts[item.get("properties",{}).get("entity_code","")] += 1
    after_counts = defaultdict(int)
    for item in features: after_counts[item["properties"]["entity_code"]] += 1
    report["feature_counts_before_after_by_entity"] = {e["code"]:{"before":before_counts[e["code"]],"after":after_counts[e["code"]]} for e in entities}
    report["entities_with_geometry"] = {"count":sum(v>0 for v in after_counts.values()),"total_entities":len(entities),"entity_codes":sorted(after_counts)}
    report["source_results"] = source_results
    report["source_failures"] = failures
    report["bbox_wgs84"] = list(BBOX)
    report["features_written"] = feature_count
    report["features_by_entity"] = {code: sum(1 for f in features if f["properties"]["entity_code"] == code) for code in sorted({f["properties"]["entity_code"] for f in features})}
    report["road_gaps"] = list({(g["entity_code"],tuple(g["endpoint"])):g for g in report.get("road_gaps",[])}.values())
    report["rejected_road_segments"] = list({(g["source_id"],g["entity_code"]):g for g in report.get("rejected_road_segments",[])}.values())
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
    (outdir / "match-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    raw_archives = []
    original_hashes = {item.get("input_file"):item.get("input_sha256") for item in source_results}
    for basename in ("cairo-osm-overpass-2026-11-14-extract2.json", "cairo-osm-overpass-2026-11-14-roads-full.json"):
        archive = ROOT / "data/raw" / (basename + ".gz")
        raw_archives.append({"source_file":basename,"file":str(archive.relative_to(ROOT)),"sha256_original":original_hashes.get(basename),"sha256_gzip":hashlib.sha256(archive.read_bytes()).hexdigest() if archive.exists() else None})
    manifest = {
        "title": "Greater Cairo Atlas geometry ingestion manifest", "retrieval_date": date,
        "bbox_wgs84": list(BBOX), "feature_count": feature_count,
        "sources": source_results, "source_failures": failures,
        "attribution": {"osm": OSM_ATTRIBUTION, "tfc": TFC_ATTRIBUTION},
        "license_policy": "OSM=ODbL-1.0; TfC GTFS accepted only when independently verified CC-BY-4.0. CC-BY-NC data is prohibited.",
        "matching": "Exact Unicode-normalized rev5 entity names and aliases only; roads additionally use exact name/name:ar/name:en/ref/old_name/alt_name and named road relations; generic names are not inferred. No entity creation.",
        "lifecycle_policy": "Only operational/partial entities are matched from OSM/GTFS. Planned/under-construction geometry requires official_alignment provenance and is not inferred from OSM/GTFS.",
        "geometry_policy": "WGS84 / SRID 4326; non-empty, GEOS-valid geometries must lie wholly within the declared Greater Cairo bbox. Every output geometry is checked with Shapely is_valid/explain_validity; invalid polygonal features are passed through make_valid and only polygonal components are retained. Degenerate lines and unrepaired/otherwise invalid geometries are dropped.",
        "geometry_validation": {"validator":f"Shapely {shapely.__version__}","db_constraint":"ST_SRID(geometry)=4326 AND NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry)","features_repaired_count":len(report["geometry_repairs"]),"features_dropped_count":len(report["invalid_geometry"]),"repairs":report["geometry_repairs"],"dropped":report["invalid_geometry"]},
        "osm_query_coverage": "Two user-supplied Overpass extracts from https://overpass-api.de/api/interpreter (2026-11-14), both bbox query envelope [29.2,30.5,30.8,32.1] as south,west,north,east. The roads-full extract supplies full road-way geometry and route road relations; extract2 supplies administrative/place/aerodrome/bridge/landmark objects and other OSM candidates. Matching remains limited to explicit rev5 names/aliases. New extracts do not replace preserved previously accepted transit geometries where no replacement transit source was submitted. Geometry acceptance bbox is WGS84 [30.5,29.2,32.1,30.8].",
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
