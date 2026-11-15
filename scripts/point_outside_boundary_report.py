#!/usr/bin/env python3
"""Report entities whose recorded point lies outside their own official boundary.

BATCH 12.5 — CITY-OBOUR's atlas point sits outside its CAPMAS polygon. This script reports every
such entity instead of moving anything: the point is what the source says, and silently relocating
it would fabricate a location. Output: data/features/point-outside-boundary-report.json

Requires Shapely.
"""
from __future__ import annotations

import json
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

from shapely.geometry import Point, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
ENTITY_BOUNDARIES = ROOT / "data/features/codab-entity-boundaries.geojson"
OSM_BOUNDARIES = ROOT / "data/features/boundaries.geojson"
MAP_GEOMETRIES = ROOT / "data/derived/entity-map-geometries.json"
FEATURES = ROOT / "data/features/features.geojson"
REPORT = ROOT / "data/features/point-outside-boundary-report.json"

# Points are compared against a boundary that was rounded to 1e-5 degrees (~1 m) when it was imported,
# and against source coordinates that are often deliberately coarse. A point this close to the edge is
# recorded as "on_edge" rather than "outside", because calling it outside would overstate the finding.
EDGE_TOLERANCE_DEGREES = 1e-6

# Reported as data quality, not as a location claim: these coordinates are exact round numbers, which
# usually means a placeholder rather than a surveyed position.
ROUND_COORDINATE_TOLERANCE = 1e-7


def point_list(geometry: dict[str, Any] | None) -> list[tuple[float, float]]:
    if not geometry:
        return []
    kind = geometry.get("type")
    if kind == "Point":
        coordinates = geometry.get("coordinates")
        if isinstance(coordinates, list) and len(coordinates) >= 2:
            return [(float(coordinates[0]), float(coordinates[1]))]
    if kind == "MultiPoint":
        return [(float(item[0]), float(item[1])) for item in geometry.get("coordinates", []) if len(item) >= 2]
    return []


def is_round(coordinate: tuple[float, float]) -> bool:
    return all(abs(value - round(value, 3)) <= ROUND_COORDINATE_TOLERANCE for value in coordinate)


def main() -> int:
    boundary_source = json.loads(ENTITY_BOUNDARIES.read_text(encoding="utf-8"))
    map_geometries = json.loads(MAP_GEOMETRIES.read_text(encoding="utf-8"))["geometries"]

    official: dict[str, list[Any]] = {}
    metadata: dict[str, dict[str, Any]] = {}
    for feature in boundary_source["features"]:
        properties = feature["properties"]
        code = properties["entity_code"]
        official.setdefault(code, []).append(shape(feature["geometry"]))
        metadata[code] = {
            "name_ar": properties.get("name_ar"),
            "name_en": properties.get("name_en"),
            "pcodes": properties.get("pcodes"),
            "evidence_code": properties.get("evidence_code"),
            "source": properties.get("source"),
            "license": properties.get("license"),
        }

    # A second, independent boundary source: OSM boundaries already paired to an entity.
    osm: dict[str, list[Any]] = {}
    if OSM_BOUNDARIES.exists():
        for feature in json.loads(OSM_BOUNDARIES.read_text(encoding="utf-8"))["features"]:
            code = feature.get("properties", {}).get("entity_code")
            if code and feature.get("geometry"):
                osm.setdefault(code, []).append(shape(feature["geometry"]))

    # Fall back to the drawn point features for any boundary entity with no derived map point, so the
    # report covers every entity that has both a point and a boundary.
    feature_points: dict[str, list[tuple[float, float]]] = {}
    for feature in json.loads(FEATURES.read_text(encoding="utf-8"))["features"]:
        geometry = feature.get("geometry")
        if geometry and geometry.get("type") == "Point":
            feature_points.setdefault(feature["properties"]["entity_code"], []).append(
                (float(geometry["coordinates"][0]), float(geometry["coordinates"][1]))
            )

    findings: list[dict[str, Any]] = []
    checked = 0
    for code in sorted(official):
        shapely_boundary = unary_union(official[code])
        points = point_list((map_geometries.get(code) or {}).get("geometry"))
        if not points:
            points = feature_points.get(code, [])
        if not points:
            continue
        checked += 1
        for coordinate in points:
            point = Point(coordinate)
            if shapely_boundary.buffer(EDGE_TOLERANCE_DEGREES).contains(point):
                continue
            state = "outside" if not shapely_boundary.buffer(1e-6).contains(point) else "on_edge"
            inside_osm = None
            if code in osm:
                inside_osm = any(candidate.buffer(EDGE_TOLERANCE_DEGREES).contains(point) for candidate in osm[code])
            findings.append({
                "entity_code": code,
                **metadata[code],
                "point": [coordinate[0], coordinate[1]],
                "state": state,
                "distance_outside_m": round(shapely_boundary.exterior.distance(point) * 111_320, 1)
                if shapely_boundary.geom_type == "Polygon" else None,
                "inside_osm_boundary": inside_osm,
                "round_coordinate": is_round(coordinate),
                "evidence_code": metadata[code]["evidence_code"],
            })

    by_entity: dict[str, list[dict[str, Any]]] = {}
    for finding in findings:
        by_entity.setdefault(finding["entity_code"], []).append(finding)

    report = {
        "generated_on": date.today().isoformat(),
        "description": (
            "Entities whose recorded point falls outside the official (CAPMAS COD-AB) boundary of the same "
            "entity. Points are NOT moved: each row records what the source says so a human can review it. "
            "A row with inside_osm_boundary=true means the point is consistent with the OSM boundary but not "
            "with the official one, i.e. a source disagreement rather than a bad coordinate."
        ),
        "method": {
            "boundary_source": "data/features/codab-entity-boundaries.geojson",
            "osm_boundary_source": "data/features/boundaries.geojson",
            "point_source": "data/derived/entity-map-geometries.json (falls back to data/features/features.geojson)",
            "edge_tolerance_degrees": EDGE_TOLERANCE_DEGREES,
            "point_in_polygon": "shapely contains() against the union of the entity's official units",
        },
        "license": "boundaries © CAPMAS via OCHA/HDX CC BY-IGO; points © OpenStreetMap contributors ODbL where OSM-derived",
        "counts": {
            "entities_with_official_boundary": len(official),
            "entities_checked": checked,
            "entities_with_findings": len(by_entity),
            "point_findings": len(findings),
            "round_coordinate_findings": sum(1 for row in findings if row["round_coordinate"]),
            "explained_by_osm_boundary": sum(1 for row in findings if row["inside_osm_boundary"] is True),
        },
        "findings": findings,
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(REPORT.relative_to(ROOT)), **report["counts"]}, indent=2))
    for code, rows in sorted(by_entity.items()):
        print(f"  {code:28} {len(rows)} point(s) · {rows[0]['name_ar']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
