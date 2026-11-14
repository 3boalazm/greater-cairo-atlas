"""Stdlib-only OSM road topology and conservative gap-fill path search."""
from __future__ import annotations

import heapq
import math
import re
import unicodedata
from collections import defaultdict
from typing import Any

ROAD_HIGHWAYS = {
    "motorway", "trunk", "primary", "secondary",
    "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary",
}
LINK_HIGHWAYS = {highway for highway in ROAD_HIGHWAYS if highway.endswith("_link")}
TOPOLOGY_GAP_THRESHOLD_KM = 0.025


def normalize(value: str | None) -> str:
    text = unicodedata.normalize("NFKC", value or "").casefold()
    text = "".join(char for char in text if unicodedata.category(char) not in {"Mn", "Cf"})
    text = text.translate(str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ئ": "ي", "ؤ": "و", "ة": "ه"}))
    tokens = re.findall(r"[\w]+", text, flags=re.UNICODE)
    # Drop common road-type prefixes/suffixes but retain substantive names.
    road_words = {"طريق", "شارع", "محور", "محورال", "كوبري", "جسر", "road", "street", "axis", "highway", "route"}
    while tokens and tokens[0] in road_words:
        tokens.pop(0)
    while tokens and tokens[-1] in road_words:
        tokens.pop()
    return "".join(tokens)


def way_labels(tags: dict[str, Any]) -> tuple[set[str], set[str]]:
    names: set[str] = set()
    refs: set[str] = set()
    for key in ("name", "name:ar", "name:en", "official_name", "alt_name", "old_name"):
        value = tags.get(key)
        if isinstance(value, str):
            names.update(normalize(part.strip()) for part in value.split(";") if normalize(part.strip()))
    for key in ("ref", "old_ref"):
        value = tags.get(key)
        if isinstance(value, str):
            refs.update(normalize(part.strip()) for part in value.split(";") if normalize(part.strip()))
    return names, refs


def allowed_for_entity(tags: dict[str, Any], entity_names: set[str], entity_refs: set[str]) -> bool:
    """Allow only unnamed ways, matching aliases/names, or ways with the entity's exact ref."""
    names, refs = way_labels(tags)
    if not names and not refs:
        return True
    return bool(names & entity_names or refs & entity_refs)


def haversine_km(a: tuple[float, float] | list[float], b: tuple[float, float] | list[float]) -> float:
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlon, dlat = lon2 - lon1, lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(h))


def build_road_graph(elements: list[dict[str, Any]]) -> tuple[dict[int, dict[str, Any]], dict[int, list[tuple[int, int, float]]]]:
    """Build a real-way graph from shared OSM node IDs and geodesic way-segment lengths."""
    ways: dict[int, dict[str, Any]] = {}
    for item in elements:
        if item.get("type") != "way" or item.get("tags", {}).get("highway") not in ROAD_HIGHWAYS:
            continue
        nodes, geometry = item.get("nodes"), item.get("geometry")
        if not isinstance(nodes, list) or not isinstance(geometry, list) or len(nodes) < 2 or len(nodes) != len(geometry):
            continue
        try:
            normalized_geometry = [(float(point["lon"]), float(point["lat"])) for point in geometry]
            normalized_nodes = [int(node) for node in nodes]
            version = int(item.get("version", 0) or 0)
        except (KeyError, TypeError, ValueError):
            continue
        if version < 1:
            continue
        way_id = int(item["id"])
        candidate = {**item, "nodes": normalized_nodes, "_coordinates": normalized_geometry}
        previous = ways.get(way_id)
        # Input extracts overlap. Prefer the newest version, then the most complete geometry.
        if previous is None or (version, len(normalized_nodes)) > (int(previous["version"]), len(previous["nodes"])):
            ways[way_id] = candidate

    adjacency: dict[int, list[tuple[int, int, float]]] = defaultdict(list)
    for way_id, way in ways.items():
        for index, (start, end) in enumerate(zip(way["nodes"], way["nodes"][1:])):
            if start == end:
                continue
            length = haversine_km(way["_coordinates"][index], way["_coordinates"][index + 1])
            adjacency[start].append((end, way_id, length))
            adjacency[end].append((start, way_id, length))
    return ways, dict(adjacency)


def filter_graph_for_entity(
    ways: dict[int, dict[str, Any]],
    adjacency: dict[int, list[tuple[int, int, float]]],
    entity_names: set[str],
    entity_refs: set[str],
    relation_member_way_ids: set[int] | None = None,
    allow_interchange_links: bool = False,
    allow_bridges: bool = False,
) -> dict[int, list[tuple[int, int, float]]]:
    """Filter per entity; optional real OSM *_link ways can connect that entity's components."""
    relation_member_way_ids = relation_member_way_ids or set()
    allowed_ids = {
        way_id for way_id, way in ways.items()
        if way_id in relation_member_way_ids
        or allowed_for_entity(way.get("tags", {}), entity_names, entity_refs)
        or (allow_interchange_links and way.get("tags", {}).get("highway") in LINK_HIGHWAYS)
        or (allow_bridges and way.get("tags", {}).get("bridge") == "yes")
    }
    return {
        node: [edge for edge in edges if edge[1] in allowed_ids]
        for node, edges in adjacency.items()
        if any(edge[1] in allowed_ids for edge in edges)
    }


def _components(seed_way_ids: set[int], ways: dict[int, dict[str, Any]]) -> list[set[int]]:
    parent: dict[int, int] = {}

    def find(value: int) -> int:
        parent.setdefault(value, value)
        if parent[value] != value:
            parent[value] = find(parent[value])
        return parent[value]

    def union(left: int, right: int) -> None:
        a, b = find(left), find(right)
        if a != b:
            parent[max(a, b)] = min(a, b)

    node_owner: dict[int, int] = {}
    valid_seeds = sorted(way_id for way_id in seed_way_ids if way_id in ways)
    for way_id in valid_seeds:
        find(way_id)
        for node in ways[way_id]["nodes"]:
            if node in node_owner:
                union(way_id, node_owner[node])
            else:
                node_owner[node] = way_id
    groups: dict[int, set[int]] = defaultdict(set)
    for way_id in valid_seeds:
        groups[find(way_id)].add(way_id)
    return [groups[key] for key in sorted(groups)]


def _component_nodes(component: set[int], ways: dict[int, dict[str, Any]]) -> set[int]:
    return {node for way_id in component for node in ways[way_id]["nodes"]}


def _component_endpoints(component: set[int], ways: dict[int, dict[str, Any]]) -> set[int]:
    """Return matched-way endpoints only; internal vertices are not gap endpoints."""
    endpoints: set[int] = set()
    for way_id in component:
        nodes = ways[way_id]["nodes"]
        if nodes:
            endpoints.update((nodes[0], nodes[-1]))
    return endpoints


def _node_coordinate(node_id: int, ways: dict[int, dict[str, Any]]) -> list[float] | None:
    for way in ways.values():
        for index, node in enumerate(way["nodes"]):
            if node == node_id:
                return list(way["_coordinates"][index])
    return None


def _shortest_path(
    adjacency: dict[int, list[tuple[int, int, float]]],
    start_nodes: set[int],
    target_component_by_node: dict[int, int],
    max_km: float,
) -> tuple[float, int, int, list[int]] | None:
    distances: dict[int, float] = {}
    parents: dict[int, tuple[int, int]] = {}
    queue: list[tuple[float, int]] = []
    for node in sorted(start_nodes):
        distances[node] = 0.0
        heapq.heappush(queue, (0.0, node))
    while queue:
        distance, node = heapq.heappop(queue)
        if distance != distances.get(node) or distance > max_km:
            continue
        if node in target_component_by_node:
            path_ways: list[int] = []
            current = node
            while current in parents:
                previous, way_id = parents[current]
                path_ways.append(way_id)
                current = previous
            path_ways.reverse()
            return distance, current, node, path_ways
        for neighbor, way_id, edge_km in adjacency.get(node, []):
            next_distance = distance + edge_km
            if next_distance > max_km or next_distance >= distances.get(neighbor, float("inf")):
                continue
            distances[neighbor] = next_distance
            parents[neighbor] = (node, way_id)
            heapq.heappush(queue, (next_distance, neighbor))
    return None


def connect_seed_components(
    *,
    entity_code: str,
    seed_way_ids: set[int],
    ways: dict[int, dict[str, Any]],
    adjacency: dict[int, list[tuple[int, int, float]]],
    max_km: float,
    topology_gap_threshold_km: float = TOPOLOGY_GAP_THRESHOLD_KM,
) -> dict[str, Any]:
    """Connect source way components by shortest eligible OSM paths, never by synthetic edges."""
    components = _components(seed_way_ids, ways)
    initial_components = len(components)
    paths: list[dict[str, Any]] = []
    filled: set[int] = set()
    node_coordinates = {
        node: coordinate
        for way in ways.values()
        for node, coordinate in zip(way["nodes"], way["_coordinates"])
    }
    if initial_components > 1 and max_km > 0:
        selected_seed = set(seed_way_ids)
        while len(components) > 1:
            best: tuple[float, int, int, list[int], int, int] | None = None
            component_node_sets = [_component_nodes(component, ways) for component in components]
            component_endpoint_sets = [_component_endpoints(component, ways) for component in components]
            for source_index, source_nodes in enumerate(component_node_sets):
                targets: dict[int, int] = {}
                for index, node_set in enumerate(component_node_sets):
                    if index == source_index:
                        continue
                    endpoint_distance = min((
                        haversine_km(node_coordinates[left], node_coordinates[right])
                        for left in component_endpoint_sets[source_index]
                        for right in component_endpoint_sets[index]
                        if left in node_coordinates and right in node_coordinates
                    ), default=float("inf"))
                    # A tiny endpoint mismatch is topology-only. Do not bridge it with a
                    # nearby real way; preserve the disconnected OSM node IDs for review.
                    if endpoint_distance <= topology_gap_threshold_km:
                        continue
                    targets.update((node, index) for node in node_set)
                if not source_nodes or not targets:
                    continue
                result = _shortest_path(adjacency, source_nodes, targets, max_km)
                if result is None:
                    continue
                distance, source_node, target_node, path_way_ids = result
                target_index = targets[target_node]
                candidate = (distance, source_index, target_index, path_way_ids, source_node, target_node)
                if best is None or candidate[:3] < best[:3]:
                    best = candidate
            if best is None:
                break
            distance, source_index, target_index, path_way_ids, source_node, target_node = best
            added_ids = sorted(set(path_way_ids) - selected_seed)
            selected_seed.update(path_way_ids)
            filled.update(added_ids)
            paths.append({
                "entity_code": entity_code,
                "from_node": source_node,
                "to_node": target_node,
                "from_coordinate": node_coordinates.get(source_node),
                "to_coordinate": node_coordinates.get(target_node),
                "path_length_km": round(distance, 3),
                "way_ids": sorted(set(path_way_ids)),
                "filled_way_ids": added_ids,
                "interchange_link_way_ids": sorted(
                    way_id for way_id in set(path_way_ids)
                    if ways.get(way_id, {}).get("tags", {}).get("highway") in LINK_HIGHWAYS
                ),
                "method": "gap_fill_graph",
            })
            components = _components(selected_seed, ways)

    unresolved: list[dict[str, Any]] = []
    if len(components) > 1:
        component_endpoint_sets = [_component_endpoints(component, ways) for component in components]
        pair_nearest: dict[tuple[int, int], tuple[float, int, int]] = {}
        for left_index, left_nodes in enumerate(component_endpoint_sets):
            for right_index in range(left_index + 1, len(component_node_sets)):
                nearest: tuple[float, int, int] | None = None
                for left in sorted(left_nodes):
                    left_coord = node_coordinates.get(left)
                    if left_coord is None:
                        continue
                    for right in sorted(component_endpoint_sets[right_index]):
                        right_coord = node_coordinates.get(right)
                        if right_coord is None:
                            continue
                        candidate = (haversine_km(left_coord, right_coord), left, right)
                        if nearest is None or candidate < nearest:
                            nearest = candidate
                if nearest is not None:
                    pair_nearest[(left_index, right_index)] = nearest
        # A minimum spanning tree reports exactly components_after - 1 unresolved joins,
        # with endpoint coordinates and no invented geometry.
        connected_components = {0}
        while len(connected_components) < len(components):
            best: tuple[float, int, int, int, int] | None = None
            for (left_index, right_index), (distance, left, right) in pair_nearest.items():
                if (left_index in connected_components) == (right_index in connected_components):
                    continue
                candidate = (distance, left_index, right_index, left, right)
                if best is None or candidate < best:
                    best = candidate
            if best is None:
                break
            distance, left_index, right_index, left, right = best
            connected_components.update((left_index, right_index))
            gap_type = "osm_topology_gap" if distance <= topology_gap_threshold_km else "network_gap"
            unresolved.append({
                "entity_code": entity_code,
                "gap_type": gap_type,
                "component_a": left_index,
                "component_b": right_index,
                "endpoint_a": {"node_id": left, "coordinates": node_coordinates.get(left)},
                "endpoint_b": {"node_id": right, "coordinates": node_coordinates.get(right)},
                "straight_line_km": round(distance, 3),
                "max_graph_path_km": max_km,
                "reason": "osm_topology_gap" if gap_type == "osm_topology_gap" else "no eligible real-way graph path within configured maximum distance",
            })

    return {
        "entity_code": entity_code,
        "components_before": initial_components,
        "gaps_before": max(0, initial_components - 1),
        "components_after": len(components),
        "gaps_after": max(0, len(components) - 1),
        "gaps_closed": max(0, initial_components - len(components)),
        "km_closed": round(sum(item["path_length_km"] for item in paths), 3),
        "filled_way_ids": sorted(filled),
        "paths": paths,
        "unresolved_gaps": unresolved,
    }
