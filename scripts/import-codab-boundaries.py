#!/usr/bin/env python3
"""Idempotently import the reviewed CAPMAS COD-AB boundary extract.

Requires Shapely (also used by scripts/area_boundaries.py). The supplied source
files are read-only; only deterministic derived GeoJSON/relation artifacts and
one seed evidence row are written.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/cairo-codab-adm2-adm3-2026-11-15.geojson.gz"
LINKS = ROOT / "data/research/codab-boundaries/entity_links.json"
README = ROOT / "data/research/codab-boundaries/README.md"
ENTITIES = ROOT / "data/seed/entities.csv"
EVIDENCE = ROOT / "data/seed/evidence.json"
ADMIN_UNITS = ROOT / "data/features/codab-admin-units.geojson"
ENTITY_BOUNDARIES = ROOT / "data/features/codab-entity-boundaries.geojson"
RELATIONS = ROOT / "data/features/codab-relations.json"
IMPORT_REPORT = ROOT / "data/features/codab-import-report.json"
EVIDENCE_CODE = "EV-CODAB-ADMIN-2026"
SOURCE = "CAPMAS COD-AB 2017 (reviewed 2024)"
ATTRIBUTION = "حدود إدارية © CAPMAS (الجهاز المركزي للتعبئة العامة والإحصاء) عبر OCHA/HDX، بترخيص CC BY-IGO"
BBOX = (30.5, 29.2, 32.1, 30.8)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source_hashes() -> tuple[str, str]:
    text = README.read_text(encoding="utf-8")
    match = re.search(r"json sha256 ([0-9a-f]{64})", text)
    gz_match = re.search(r"gz sha256 ([0-9a-f]{64})", text)
    if not match or not gz_match:
        raise ValueError("README must record both compressed and expanded JSON SHA-256 checksums")
    return gz_match.group(1), match.group(1)


def polygonal_only(geometry: Any):
    if isinstance(geometry, Polygon):
        return geometry
    if isinstance(geometry, MultiPolygon):
        return geometry
    if isinstance(geometry, GeometryCollection) or hasattr(geometry, "geoms"):
        parts = [part for child in geometry.geoms for part in [polygonal_only(child)] if part is not None and not part.is_empty]
        return unary_union(parts) if parts else None
    return None


def read_inputs() -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], dict[str, str]]:
    gz_bytes = RAW.read_bytes()
    expected_gz, expected_json = source_hashes()
    if sha256(gz_bytes) != expected_gz:
        raise ValueError(f"Compressed source checksum mismatch for {RAW.relative_to(ROOT)}")
    json_bytes = gzip.decompress(gz_bytes)
    if sha256(json_bytes) != expected_json:
        raise ValueError("Expanded GeoJSON SHA-256 does not match the provenance README")
    geojson = json.loads(json_bytes)
    links = json.loads(LINKS.read_text(encoding="utf-8"))
    with ENTITIES.open(encoding="utf-8", newline="") as stream:
        entities = list(csv.DictReader(stream))
    return geojson, links, entities, links["adm2_display_name_fixes"]


def fmt_area(geometry) -> float:
    latitude = geometry.representative_point().y
    return round(abs(geometry.area) * 111.32 * 110.574 * max(0.1, abs(__import__("math").cos(__import__("math").radians(latitude)))), 4)


def build_outputs(geojson: dict[str, Any], links: dict[str, Any], entities: list[dict[str, Any]], fixes: dict[str, str]):
    exclusions = links["exclude_pcodes"]
    curated_links = links["links"]
    bad_pairs: dict[str, set[str]] = defaultdict(set)
    pcode_to_entities: dict[str, list[str]] = defaultdict(list)
    for link in curated_links:
        if link["relation"] == "boundary_equals_union":
            for pcode in link["pcodes"]:
                pcode_to_entities[pcode].append(link["entity_code"])
        for rejected in links["rejected_false_matches"]:
            entity_code, separator, rejected_pcode = rejected.partition("->")
            if separator and entity_code == link["entity_code"]:
                bad_pairs[entity_code].update(token for token in re.split(r"[/, ]+", rejected_pcode) if token)
        if set(link["pcodes"]) & set(exclusions):
            raise ValueError(f"Curated link uses an explicitly excluded pcode: {link['entity_code']}")
    for link in curated_links:
        if link["relation"] == "boundary_equals_union" and set(link["pcodes"]) & bad_pairs[link["entity_code"]]:
            raise ValueError(f"Curated boundary link collides with a rejected false match: {link['entity_code']}")

    clip_box = box(*BBOX)
    features: list[dict[str, Any]] = []
    clipped_count = 0
    outside: list[str] = []
    excluded: list[str] = []
    raw_by_pcode: dict[str, dict[str, Any]] = {}
    for raw in geojson["features"]:
        p = raw["properties"]
        level = int(p["level"])
        pcode = p["adm2_pcode"] if level == 2 else p["adm3_pcode"]
        if pcode in exclusions:
            excluded.append(pcode)
            continue
        source_geometry = shape(raw["geometry"])
        raw_by_pcode[pcode] = {"raw": raw, "geometry": source_geometry}
        if not source_geometry.intersects(clip_box):
            outside.append(pcode)
            continue
        geometry = source_geometry.intersection(clip_box)
        if not source_geometry.equals(geometry):
            clipped_count += 1
        geometry = polygonal_only(geometry)
        if geometry is None or geometry.is_empty:
            outside.append(pcode)
            continue
        if not geometry.is_valid:
            geometry = polygonal_only(geometry.buffer(0))
        if geometry is None or geometry.is_empty or not geometry.is_valid:
            raise ValueError(f"Invalid clipped polygon for {pcode}")
        parent_pcode = p["adm1_pcode"] if level == 2 else p["adm2_pcode"]
        parent_name_ar = p["adm1_ar"] if level == 2 else p["adm2_ar"]
        parent_name_en = p.get("adm1_en") if level == 2 else p.get("adm2_en")
        name_ar = fixes.get(pcode, p["adm2_ar"] if level == 2 else p["adm3_ar"])
        name_en = p.get("adm2_en") if level == 2 else None
        features.append({
            "type": "Feature", "id": f"CAPMAS-ADM{level}-{pcode}", "geometry": mapping(geometry),
            "properties": {
                "code": f"CAPMAS-ADM{level}-{pcode}", "pcode": pcode, "level": level,
                "name_ar": name_ar, "name_en": name_en,
                "adm1_pcode": p["adm1_pcode"], "adm1_name_ar": p["adm1_ar"], "adm1_name_en": p.get("adm1_en"),
                "parent_pcodes": [parent_pcode], "parent_name_ar": parent_name_ar, "parent_name_en": parent_name_en,
                "area_sqkm": fmt_area(geometry), "valid_on": p.get("valid_on"),
                "entity_codes": sorted(set(pcode_to_entities.get(pcode, []))),
                "license": "CC-BY-IGO", "source": SOURCE, "evidence_code": EVIDENCE_CODE,
                "attribution": ATTRIBUTION,
            },
        })
    features.sort(key=lambda f: (f["properties"]["level"], f["properties"]["pcode"]))

    entity_by_code = {entity["code"]: entity for entity in entities}
    entity_features = []
    boundary_links = [item for item in curated_links if item["relation"] == "boundary_equals_union"]
    for link in boundary_links:
        code = link["entity_code"]
        missing = [p for p in link["pcodes"] if p not in raw_by_pcode or p not in {f["properties"]["pcode"] for f in features}]
        if missing:
            raise ValueError(f"Linked entity {code} has no in-extent official geometry for {missing}")
        geom = unary_union([shape(next(f["geometry"] for f in features if f["properties"]["pcode"] == p)) for p in link["pcodes"]])
        if not geom.is_valid:
            geom = geom.buffer(0)
        if not geom.is_valid or geom.is_empty:
            raise ValueError(f"Invalid official union boundary for {code}")
        entity = entity_by_code.get(code)
        if not entity:
            raise ValueError(f"Curated link references unknown entity {code}")
        entity_features.append({
            "type": "Feature", "id": f"CAPMAS-ENTITY-{code}", "geometry": mapping(geom),
            "properties": {
                "code": f"CAPMAS-ENTITY-{code}", "entity_code": code,
                "name_ar": entity["name_ar"], "name_en": entity["name_en"],
                "name_ar_units": link.get("names_ar", []), "pcodes": link["pcodes"],
                "level": 2, "license": "CC-BY-IGO", "source": SOURCE,
                "evidence_code": EVIDENCE_CODE, "attribution": ATTRIBUTION,
                "area_sqkm": round(sum(next(f["properties"]["area_sqkm"] for f in features if f["properties"]["pcode"] == p) for p in link["pcodes"]), 4),
            },
        })
    entity_features.sort(key=lambda f: f["properties"]["entity_code"])

    # BATCH 12.4 — governorate parentage straight from the CAPMAS adm1 fields of the very units each
    # entity boundary is built from. No geometry is consulted and nothing is inferred beyond the
    # published adm1_pcode/adm1_ar of those units, so this is evidence-backed, not a spatial guess.
    adm1_by_pcode = {}
    for feature in features:
        props = feature["properties"]
        adm1_by_pcode[props["pcode"]] = (props["adm1_pcode"], props["adm1_name_ar"], props["adm1_name_en"])

    relations = []
    for link in boundary_links:
        parents = {adm1_by_pcode[pcode] for pcode in link["pcodes"]}
        if len(parents) != 1:
            raise ValueError(
                f"Entity {link['entity_code']} spans more than one governorate in CAPMAS adm1: {sorted(parents)}; "
                "refusing to derive a single parent governorate"
            )
        adm1_pcode, adm1_ar, adm1_en = parents.pop()
        entity = entity_by_code.get(link["entity_code"])
        relations.append({
            "entity_code": link["entity_code"], "relation": "governorate",
            "adm1_pcode": adm1_pcode, "adm1_name_ar": adm1_ar, "adm1_name_en": adm1_en,
            "pcodes": link["pcodes"],
            "evidence_code": EVIDENCE_CODE, "source": SOURCE, "license": "CC-BY-IGO",
        })

    curated_located_within = [link for link in curated_links if link["relation"] == "located_within"]
    for link in curated_located_within:
        relations.append({
            "entity_code": link["entity_code"], "relation": "located_within",
            "pcodes": link["pcodes"], "names_ar": link["names_ar"],
            "evidence_code": EVIDENCE_CODE, "source": SOURCE, "license": "CC-BY-IGO",
        })
    relations.sort(key=lambda relation: relation["entity_code"])
    return features, entity_features, relations, {
        "input_features": len(geojson["features"]), "excluded_features": len(set(excluded)),
        "out_of_extent_features": len(outside), "clipped_features": clipped_count,
        "imported_features": len(features), "entity_union_boundaries": len(entity_features),
        "located_within_relations": len(curated_located_within), "governorate_relations": len(relations) - len(curated_located_within), "excluded_pcodes": sorted(set(excluded)),
        "out_of_extent_pcodes": sorted(outside),
    }


def ensure_evidence() -> None:
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    expected = {
        "code": EVIDENCE_CODE, "title": "Egypt – Subnational Administrative Boundaries (COD-AB)",
        "url": "https://data.humdata.org/dataset/cod-ab-egy", "publisher": "CAPMAS / OCHA HDX",
        "source_type": "official", "published_date": None, "published_date_precision": "day",
        "accessed_date": "2026-11-15",
        "notes": "License: CC BY-IGO. Administrative boundaries © CAPMAS, via OCHA/HDX (CC BY-IGO). Source created 2017 and reviewed 2024.",
    }
    found = [item for item in evidence if item.get("code") == EVIDENCE_CODE]
    if len(found) > 1:
        raise ValueError(f"Evidence code {EVIDENCE_CODE} occurs more than once; expected exactly one dataset record")
    if found and found[0] != expected:
        raise ValueError(f"Evidence code {EVIDENCE_CODE} exists but its details differ from the curated import source")
    if not found:
        evidence.append(expected)
        EVIDENCE.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_or_check(path: Path, value: Any, check: bool) -> None:
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if check:
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            raise ValueError(f"Generated file is stale: {path.relative_to(ROOT)} (run this importer)")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify generated artifacts without writing")
    args = parser.parse_args()
    geojson, links, entities, fixes = read_inputs()
    units, unions, relations, report = build_outputs(geojson, links, entities, fixes)
    collection = {"type": "FeatureCollection", "name": "CAPMAS COD-AB administrative units for Greater Cairo", "metadata": {
        "source": SOURCE, "evidence_code": EVIDENCE_CODE, "license": "CC-BY-IGO", "attribution": ATTRIBUTION,
        "bbox_wgs84": list(BBOX), "source_json_sha256": source_hashes()[1],
    }, "features": units}
    entity_collection = {"type": "FeatureCollection", "name": "Curated official entity boundary unions", "metadata": collection["metadata"], "features": unions}
    if args.check:
        write_or_check(ADMIN_UNITS, collection, True)
        write_or_check(ENTITY_BOUNDARIES, entity_collection, True)
        write_or_check(RELATIONS, relations, True)
        write_or_check(IMPORT_REPORT, report, True)
        evidence_rows = [x for x in json.loads(EVIDENCE.read_text(encoding="utf-8")) if x.get("code") == EVIDENCE_CODE]
        if len(evidence_rows) != 1:
            raise ValueError(f"Expected exactly one seed evidence row {EVIDENCE_CODE}; found {len(evidence_rows)}")
    else:
        ensure_evidence()
        write_or_check(ADMIN_UNITS, collection, False)
        write_or_check(ENTITY_BOUNDARIES, entity_collection, False)
        write_or_check(RELATIONS, relations, False)
        write_or_check(IMPORT_REPORT, report, False)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("Excluded or skipped pcode list is recorded in this report; no non-curated entity matches are generated.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"COD-AB import failed: {error}", file=sys.stderr)
        raise SystemExit(1)
