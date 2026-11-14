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
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any

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
    if outcome != "matched":
        report["unmatched" if outcome == "unmatched" else "ambiguous"].append({
            "source_id": source_id, "source_name": source_name,
            "entity_type": kind, "candidate_entity_codes": candidates,
            "reason": reason or outcome,
        })


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


def new_report():
    return {"by_type": {t: {k: 0 for k in ("matched", "unmatched", "ambiguous")} for t in ("road", "transit_line", "transit_stop", "rail_station")}, "unmatched": [], "ambiguous": []}


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
    parser.add_argument("--osm-json", help="Previously downloaded Overpass JSON extract")
    parser.add_argument("--osm-source-url", help="Original OSM extract URL when using --osm-json")
    parser.add_argument("--osm-retrieval-date", help="ISO date the supplied OSM extract was retrieved")
    parser.add_argument("--fetch-osm", action="store_true", help="Fetch matching objects from Overpass now")
    parser.add_argument("--gtfs-zip", help="TfC GTFS zip from the Transport Data Commons release")
    parser.add_argument("--gtfs-retrieval-date", help="ISO date the supplied GTFS archive was retrieved")
    parser.add_argument("--gtfs-license", help="Must explicitly be CC-BY-4.0; CC-BY-NC is rejected")
    parser.add_argument("--gtfs-license-evidence-url", help="Exact Transport Data Commons dataset page documenting CC-BY-4.0")
    parser.add_argument("--match-rules", default=str(OUT / "match-rules.json"), help="Optional per-entity OSM match rules JSON")
    parser.add_argument("--out", default=str(OUT))
    args = parser.parse_args()
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
        try:
            osm = load_osm(args)
            features.extend(process_osm(osm, entities, osm_date, report, rules))
            input_path = Path(args.osm_json) if args.osm_json else None
            source_results.append({"source": "OpenStreetMap", "url": args.osm_source_url or OVERPASS_URL, "retrieval_date": osm_date, "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat() if args.fetch_osm else None, "input_file": input_path.name if input_path else None, "input_sha256": hashlib.sha256(input_path.read_bytes()).hexdigest() if input_path else None, "license": "ODbL-1.0", "elements_received": len(osm.get("elements", [])), "timestamp_osm_base": osm.get("osm3s", {}).get("timestamp_osm_base")})
        except Exception as exc:
            failures.append({"source": "OpenStreetMap Overpass API", "error": str(exc)})
    if args.gtfs_zip:
        try:
            features.extend(process_gtfs(Path(args.gtfs_zip), entities, gtfs_date, args.gtfs_license, args.gtfs_license_evidence_url, report))
            source_results.append({"source": "Transport for Cairo GTFS via Transport Data Commons", "url": args.gtfs_license_evidence_url, "retrieval_date": gtfs_date, "retrieved_at": None, "file": Path(args.gtfs_zip).name, "license": "CC-BY-4.0"})
        except Exception as exc:
            failures.append({"source": "Transport for Cairo GTFS via Transport Data Commons", "error": str(exc)})
    # Features are deterministic: sort by stable code and refuse accidental duplicates.
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
    report["candidate_entities"] = {key: sum(1 for e in entities if e["entity_type"] == value) for key, value in target_types.items()}
    report["source_results"] = source_results
    report["source_failures"] = failures
    report["bbox_wgs84"] = list(BBOX)
    report["features_written"] = feature_count
    report["features_by_entity"] = {code: sum(1 for f in features if f["properties"]["entity_code"] == code) for code in sorted({f["properties"]["entity_code"] for f in features})}
    report["retrieval_date"] = date
    (outdir / "match-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    raw_archive = ROOT / "data/raw/osm-overpass-2026-11-14.json.gz"
    raw_archive_sha256 = hashlib.sha256(raw_archive.read_bytes()).hexdigest() if raw_archive.exists() else None
    manifest = {
        "title": "Greater Cairo Atlas geometry ingestion manifest", "retrieval_date": date,
        "bbox_wgs84": list(BBOX), "feature_count": feature_count,
        "sources": source_results, "source_failures": failures,
        "attribution": {"osm": OSM_ATTRIBUTION, "tfc": TFC_ATTRIBUTION},
        "license_policy": "OSM=ODbL-1.0; TfC GTFS accepted only when independently verified CC-BY-4.0. CC-BY-NC data is prohibited.",
        "matching": "exact Unicode-normalized Arabic/English name or alias, gated by entity_type; no entity creation; unmatched/ambiguous items remain in match-report.json",
        "lifecycle_policy": "Only operational/partial entities are matched from OSM/GTFS. Planned/under-construction geometry requires official_alignment provenance and is not inferred from OSM/GTFS.",
        "geometry_policy": "WGS84 / SRID 4326; geometries must lie wholly within the declared Greater Cairo bbox.",
        "osm_query_coverage": "Supplied Overpass extract: route relations subway/light_rail/monorail/train; selected railway ways; named motorway/trunk highways only; station/platform/stop nodes. It does not cover primary/secondary highways or bus routes. Extract bbox is [29.2,30.5,30.8,32.1] as south,west,north,east in the submitted query; geometry acceptance bbox is WGS84 [30.5,29.2,32.1,30.8].",
        "match_rules_file": "match-rules.json",
        "raw_extract": "data/raw/osm-overpass-2026-11-14.json.gz",
        "raw_extract_sha256": raw_archive_sha256
    }
    (outdir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"features_written": feature_count, "by_type": report["by_type"], "candidate_entities": report["candidate_entities"], "source_failures": failures}, ensure_ascii=False, indent=2))
    if failures:
        print("One or more sources were unavailable/rejected. No unsupported geometry was fabricated.", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
