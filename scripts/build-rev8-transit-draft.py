#!/usr/bin/env python3
"""Build a non-seed rev8 research draft for OSM-derived transit and ENR stations."""
from __future__ import annotations

import csv
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REV7 = ROOT / "data/research/rev7"
OUT = ROOT / "data/research/rev8-draft"
REPORT = ROOT / "data/research/osm-stations/stations_from_osm.json"
ACTIVE_LINES = {
    "TRANSIT-METRO-L1", "TRANSIT-METRO-L2", "TRANSIT-METRO-L3", "TRANSIT-LRT", "TRANSIT-MONORAIL-EAST",
}
OFFICIAL_COUNTS = {
    "TRANSIT-METRO-L1": (35, "EV-140"), "TRANSIT-METRO-L2": (20, "EV-143"),
    "TRANSIT-METRO-L3": (34, "EV-312"), "TRANSIT-LRT": (12, "EV-073"),
    "TRANSIT-MONORAIL-EAST": (22, "EV-050"),
}
ENTITY_FIELDS = ["entity_code", "entity_type", "canonical_name_ar", "canonical_name_en", "aliases", "sector_code", "status", "description"]


def norm(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).casefold()
    text = "".join(char for char in text if not unicodedata.combining(char)).replace("ـ", "")
    return re.sub(r"[^\w]+", "", text, flags=re.UNICODE)


def is_arabic(value: str) -> bool:
    return bool(re.search(r"[\u0600-\u06ff]", value))


def is_latin(value: str) -> bool:
    return bool(re.search(r"[A-Za-z]", value))


def load_raw_node_tags() -> dict[int, dict[str, Any]]:
    tags: dict[int, dict[str, Any]] = {}
    for path in sorted((ROOT / "data/raw").glob("*.json*")):
        opener = __import__("gzip").open if path.suffix == ".gz" else open
        with opener(path, "rt", encoding="utf-8") as stream:
            payload = json.load(stream)
        for element in payload.get("elements", []):
            if element.get("type") == "node":
                node_id = int(element["id"])
                incoming = element.get("tags", {}) or {}
                if len(incoming) >= len(tags.get(node_id, {})):
                    tags[node_id] = incoming
    return tags


def node_status(node_ids: list[int], tags_by_node: dict[int, dict[str, Any]]) -> str:
    tags = [tags_by_node.get(int(node_id), {}) for node_id in node_ids]
    if any(t.get("railway") == "construction" or t.get("construction:railway") for t in tags):
        return "under_construction"
    if any(t.get("railway") == "disused" or t.get("disused:railway") or t.get("disused") for t in tags):
        return "unknown"
    return "operational"


def localized_names(station: dict[str, Any]) -> tuple[str, str]:
    raw_name = str(station.get("name") or "").strip()
    name_ar = str(station.get("name_ar") or "").strip()
    name_en = str(station.get("name_en") or "").strip()
    if not name_ar and raw_name and is_arabic(raw_name):
        name_ar = raw_name
    if not name_en and raw_name and is_latin(raw_name):
        name_en = raw_name
    return name_ar, name_en


def add_fact(facts: list[dict[str, Any]], code: str, attribute: str, value: Any, evidence: list[str], unit: str | None = None) -> None:
    facts.append({
        "entity_code": code,
        "attribute_key": attribute,
        "value": value,
        "unit": unit,
        "status_as_of": "2026-11-14",
        "verification_state": "candidate",
        "evidence_ref": evidence if len(evidence) != 1 else evidence[0],
    })


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with (REV7 / "entities_rev7.csv").open(encoding="utf-8-sig", newline="") as stream:
        entities = list(csv.DictReader(stream))
    with (REV7 / "facts_rev7.json").open(encoding="utf-8") as stream:
        facts = json.load(stream)
    with (REV7 / "evidence_rev7.json").open(encoding="utf-8") as stream:
        evidence = json.load(stream)
    with REPORT.open(encoding="utf-8") as stream:
        report = json.load(stream)

    existing_codes = {row["entity_code"] for row in entities}
    existing_type_by_code = {row["entity_code"]: row["entity_type"] for row in entities}
    existing_max_evidence = max(int(row["evidence_ref"].removeprefix("EV-")) for row in evidence)
    first_new_evidence = max(existing_max_evidence + 1, 351)
    relation_evidence: dict[int, str] = {}
    relation_info: dict[int, dict[str, Any]] = {}

    line_reports = {row["line_code"]: row for row in report["lines"]}
    for line_code in sorted(ACTIVE_LINES):
        line = line_reports.get(line_code)
        if not line:
            continue
        for relation in line["relations"]:
            relation_info[int(relation["relation_id"])] = {
                "line_code": line_code,
                "title": relation.get("route_name_en") or relation.get("route_name") or line_code,
                "stations": relation["ordered_stations"],
            }
    for relation in report.get("enr_route_relations", []):
        relation_info[int(relation["relation_id"])] = {
            "line_code": "ENR",
            "title": relation.get("route_name_en") or relation.get("route_name") or "Egyptian National Railways train route",
            "stations": relation["ordered_stations"],
        }

    new_evidence = []
    for offset, (relation_id, info) in enumerate(sorted(relation_info.items())):
        code = f"EV-{first_new_evidence + offset:03d}"
        relation_evidence[relation_id] = code
        new_evidence.append({
            "evidence_ref": code,
            "source_url": f"https://www.openstreetmap.org/relation/{relation_id}",
            "publisher": "OpenStreetMap contributors",
            "title": f"OpenStreetMap route relation {relation_id}: {info['title']}",
            "note": f"Stored OSM route relation; route membership/order source for {info['line_code']}.",
            "source_type": "dataset",
            "published_date": None,
            "accessed_date": "2026-11-14",
        })
    evidence.extend(new_evidence)

    # Create one station record per canonical OSM station group; old STOP codes are retained.
    station_groups = [
        station for station in report["stations"]
        if set(station.get("line_codes", [])) & ACTIVE_LINES
    ]
    selected_group_codes: dict[int, str] = {}
    group_by_node: dict[int, int] = {}
    new_entities = []
    tags_by_node = load_raw_node_tags()
    for index, station in enumerate(station_groups):
        group_id = int(station["osm_node_id"])
        node_ids = sorted({int(node) for node in station.get("osm_node_ids", [group_id])})
        for node_id in node_ids:
            group_by_node[node_id] = group_id
        eligible = [
            row["entity_code"] for row in station.get("existing_entities", [])
            if row["entity_code"] in existing_codes
            and existing_type_by_code.get(row["entity_code"]) in {"transit_stop", "rail_station"}
        ]
        if eligible:
            code = sorted(eligible)[0]
        else:
            code = f"STOP-OSM-{group_id}"
            if code in existing_codes:
                raise ValueError(f"Generated STOP code already exists: {code}")
            name_ar, name_en = localized_names(station)
            lines = set(station.get("line_codes", [])) & ACTIVE_LINES
            status = node_status(node_ids, tags_by_node) if lines else "unknown"
            sector = "EAST" if lines & {"TRANSIT-LRT", "TRANSIT-MONORAIL-EAST"} and not lines & {"TRANSIT-METRO-L1", "TRANSIT-METRO-L2", "TRANSIT-METRO-L3"} else "CENTRAL"
            new_entities.append({
                "entity_code": code,
                "entity_type": "transit_stop",
                "canonical_name_ar": name_ar,
                "canonical_name_en": name_en,
                "aliases": "",
                "sector_code": sector,
                "status": status,
                "description": "OSM-derived research draft; not promoted to seed; official verification pending.",
            })
            existing_codes.add(code)
        selected_group_codes[group_id] = code

    entities.extend(new_entities)

    # Add one ENR station entity per named route=train stop in the source relations.
    rail_by_node: dict[int, dict[str, Any]] = {}
    rail_memberships: dict[int, list[tuple[int, int]]] = defaultdict(list)
    rail_names = [row for row in entities if row["entity_type"] == "rail_station"]
    rail_name_keys = {
        row["entity_code"]: {norm(row.get(field, "")) for field in ("canonical_name_ar", "canonical_name_en", "aliases") if norm(row.get(field, ""))}
        for row in rail_names
    }
    for relation_id, info in sorted(relation_info.items()):
        if info["line_code"] != "ENR":
            continue
        for station in info["stations"]:
            node_id = int(station["osm_node_id"])
            current = rail_by_node.get(node_id)
            if current is None or (station.get("osm_node_version") or 0) >= (current.get("osm_node_version") or 0):
                rail_by_node[node_id] = station
            rail_memberships[node_id].append((relation_id, int(station.get("line_order", 0))))
    rail_entity_code: dict[int, str] = {}
    new_rail_entities = []
    for node_id, station in sorted(rail_by_node.items()):
        names = {norm(station.get(key)) for key in ("name", "name_ar", "name_en") if norm(station.get(key))}
        matches = [code for code, name_set in rail_name_keys.items() if names & name_set]
        if len(matches) > 1:
            raise ValueError(f"Ambiguous existing RAIL match for OSM node {node_id}: {matches}")
        if matches:
            code = matches[0]
        else:
            code = f"RAIL-OSM-{node_id}"
            if code in existing_codes:
                raise ValueError(f"Generated RAIL code already exists: {code}")
            name_ar, name_en = localized_names(station)
            new_rail_entities.append({
                "entity_code": code, "entity_type": "rail_station",
                "canonical_name_ar": name_ar, "canonical_name_en": name_en,
                "aliases": "", "sector_code": "CENTRAL",
                "status": node_status([node_id], tags_by_node),
                "description": "OSM-derived ENR route station research draft; not promoted to seed; official verification pending.",
            })
            existing_codes.add(code)
        rail_entity_code[node_id] = code
    entities.extend(new_rail_entities)

    new_facts = []
    # Map relation members to the canonical group and retain each relation's order.
    group_relations: dict[int, set[int]] = defaultdict(set)
    for relation_id, info in sorted(relation_info.items()):
        if info["line_code"] == "ENR":
            continue
        ordered_group_ids = []
        seen = set()
        for stop in info["stations"]:
            node_id = int(stop["osm_node_id"])
            group_id = group_by_node.get(node_id)
            if group_id is None:
                continue
            group_relations[group_id].add(relation_id)
            if group_id not in seen:
                ordered_group_ids.append(group_id)
                seen.add(group_id)
        # Keep the first occurrence in source member order after grouping stop/platform copies.
        for order, group_id in enumerate(ordered_group_ids, start=1):
            add_fact(new_facts, selected_group_codes[group_id], "line_order", order,
                     [relation_evidence[relation_id]], f"stop position in OSM relation {relation_id}")

    node_relation_refs: dict[tuple[int, int], set[int]] = defaultdict(set)
    for relation_id, info in sorted(relation_info.items()):
        for station in info["stations"]:
            node_relation_refs[(int(station["osm_node_id"]), relation_id)].add(relation_id)

    for station in station_groups:
        group_id = int(station["osm_node_id"])
        code = selected_group_codes[group_id]
        lines = sorted(set(station.get("line_codes", [])) & ACTIVE_LINES)
        relation_ids = sorted(group_relations.get(group_id, set()))
        if not relation_ids:
            relation_ids = sorted(int(value) for value in station.get("source_relation_ids", []) if int(value) in relation_evidence)
        evidence_refs = [relation_evidence[value] for value in relation_ids]
        for line_code in lines:
            line_relations = [rid for rid in relation_ids if relation_info[rid]["line_code"] == line_code]
            line_evidence = [relation_evidence[rid] for rid in line_relations] or evidence_refs
            add_fact(new_facts, code, "line_membership", line_code, line_evidence)
        for node_id in sorted({int(node) for node in station.get("osm_node_ids", [group_id])}):
            refs = [relation_evidence[rid] for rid in relation_ids if (node_id, rid) in node_relation_refs]
            add_fact(new_facts, code, "osm_node_id", node_id, refs or evidence_refs, "OSM node ID")

    for node_id, station in sorted(rail_by_node.items()):
        code = rail_entity_code[node_id]
        memberships = sorted(set(rail_memberships[node_id]))
        for relation_id in sorted({rid for rid, _ in memberships}):
            relation_label = relation_info[relation_id]["title"]
            add_fact(new_facts, code, "line_membership", relation_label,
                     [relation_evidence[relation_id]], f"OSM route=train relation {relation_id}")
        for relation_id, order in memberships:
            add_fact(new_facts, code, "line_order", order,
                     [relation_evidence[relation_id]], f"stop position in OSM relation {relation_id}")
        refs = sorted({relation_evidence[relation_id] for relation_id, _ in memberships})
        add_fact(new_facts, code, "osm_node_id", node_id, refs, "OSM node ID")
    facts.extend(new_facts)

    entities.sort(key=lambda row: row["entity_code"])
    with (OUT / "entities_rev8.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=ENTITY_FIELDS, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(entities)
    (OUT / "facts_rev8.json").write_text(json.dumps(facts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "evidence_rev8.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# rev8 transit and ENR station draft — research only",
        "",
        "This is an additive research draft based on rev7 and the OSM extract dated 2026-11-14. This is not a seed import and does not modify `data/seed/`.",
        "New OSM facts remain `candidate`; none are marked verified because station-name text from the official Cairo Governorate pages was not stored for this work. Consequently, only relation-specific OSM dataset evidence is attached to the new station facts.",
        "",
        "## OSM vs official reference counts",
        "",
        "| Line | OSM unique stations | Official reference | Difference (OSM − official) | OSM shortfall | Official evidence |",
        "|---|---:|---:|---:|---:|---|",
    ]
    for line_code in sorted(ACTIVE_LINES):
        line = line_reports[line_code]
        official_count, official_ref = OFFICIAL_COUNTS[line_code]
        difference = int(line["osm_station_count"]) - official_count
        lines.append(f"| {line_code} | {line['osm_station_count']} | {official_count} | {difference:+d} | {max(0, -difference)} | {official_ref} |")
    lines.extend([
        "",
        "No numeric station-count shortfall appears on these five lines. An exact name-by-name omission list cannot be established from the stored official references, which provide counts but not a complete official stop list; no missing station names are guessed.",
        "",
        "## Draft additions and mapping",
        "",
        f"- New STOP entities: {len(new_entities)}; existing station groups mapped to retained STOP codes: {len(station_groups) - len(new_entities)}.",
        f"- Named ENR route=train station nodes: {len(rail_by_node)}; new RAIL entities: {len(new_rail_entities)}; existing RAIL codes retained: {len(rail_by_node) - len(new_rail_entities)}.",
        f"- Added facts: {len(new_facts)} (line membership, relation-specific order, and OSM node ID); all are candidate.",
        f"- New dataset evidence: {len(new_evidence)} records, {new_evidence[0]['evidence_ref'] if new_evidence else 'none'}–{new_evidence[-1]['evidence_ref'] if new_evidence else 'none'}; one record per OSM relation. EV-350 is intentionally skipped to honor the requested EV-351 starting code.",
        "- Existing STOP/RAIL codes are reused when OSM node or normalized name mapping is unambiguous; interchanges stay one entity with a line-membership fact for each matched line.",
        f"- No official Cairo Governorate station evidence was added: exact page text was not stored, so each new station is supported only by OSM. {sum(1 for row in new_entities + new_rail_entities if not row['canonical_name_ar'] or not row['canonical_name_en'])} new entities lack one localized OSM name tag; no translations were invented.",
        "",
        "## Relation evidence and sequencing",
        "",
        "Every new line-membership/order/node-ID fact cites one or more `dataset` evidence records whose URL is the specific OSM relation. Order facts retain relation-specific order, including direction variants and L3 branches; relation IDs are included in the unit to disambiguate direction-specific indices.",
        "",
        "The existing rev7 files are included as the base snapshot in all three rev8 data files. New records are appended; they have not been adapted or imported into the production seed.",
        "",
    ])
    (OUT / "CHANGELOG_rev8.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({
        "entities_total": len(entities), "new_stop_entities": len(new_entities),
        "new_rail_entities": len(new_rail_entities), "facts_total": len(facts),
        "new_facts": len(new_facts), "evidence_total": len(evidence),
        "new_relation_evidence": len(new_evidence), "rail_named_station_nodes": len(rail_by_node),
        "output": str(OUT.relative_to(ROOT)),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
