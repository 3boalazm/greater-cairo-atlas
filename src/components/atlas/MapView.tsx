"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { AtlasFeatureCollection, AtlasTheme } from "./atlas-client";
import type { AreaBoundaryFeature } from "@/lib/atlas/area-boundaries";
import { getAtlasMapStyleUrl } from "./map-styles";
import { TRANSIT_LINE_COLORS, TRANSIT_LINE_MUTED_COLORS, TRANSIT_MODE_LABELS, type TransitMode } from "@/lib/atlas/transit-modes";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

export type MapStyleStatus = "loading" | "ready" | "error";

const sourceId = "atlas-features";
const roadNetworkSourceId = "atlas-road-network";
const roadNetworkDetailSourceId = "atlas-road-network-detail";
const roadNetworkLayerId = "atlas-road-network-lines";
const roadNetworkDetailLayerId = "atlas-road-network-detail-lines";
const railNetworkSourceId = "atlas-rail-network";
const railNetworkDetailSourceId = "atlas-rail-network-detail";
const railOperationalLayerIds = ["atlas-rail-operational-low", "atlas-rail-operational-detail"];
const railConstructionLayerIds = ["atlas-rail-construction-low", "atlas-rail-construction-detail"];
const railDisusedLayerIds = ["atlas-rail-disused-low", "atlas-rail-disused-detail", "atlas-rail-preserved-low", "atlas-rail-preserved-detail"];
const railStationLayerIds = ["atlas-rail-stations", "atlas-rail-station-labels"];
const transitStationSourceId = "atlas-transit-stations";
const boundarySourceId = "atlas-area-boundary";
const boundaryFillLayerId = "atlas-area-boundary-fill";
const boundaryOutlineLayerId = "atlas-area-boundary-outline";
const stationIconLayers = ["atlas-station-entity-icons", "atlas-transit-station-icons"];
const stationLabelLayers = ["atlas-transit-station-labels", "atlas-station-entity-labels"];
const stationRingLayers = ["atlas-station-entity-interchange-ring", "atlas-transit-interchange-ring"];
const lineLayers = ["atlas-polygons-fill", "atlas-polygons-outline", "atlas-roads-casing", "atlas-lines-operational", "atlas-lines-partial", "atlas-lines-construction", "atlas-lines-planned", "atlas-lines-unknown", "atlas-points", ...stationIconLayers];

type MapExpression = import("maplibre-gl").ExpressionSpecification;

interface RailLoadState { baseRequested: boolean; detailRequested: boolean }
const railLoadStates = new WeakMap<MapLibreMap, RailLoadState>();
const EMPTY_GEOJSON: FeatureCollection = { type: "FeatureCollection", features: [] };
const RAIL_STATION_BASE_FILTER: unknown[] = ["all", ["==", ["geometry-type"], "Point"], ["in", ["get", "railway"], ["literal", ["station", "halt"]]]];

function syncRailLayers(map: MapLibreMap, enabled: boolean, showDisused: boolean) {
  const state = railLoadStates.get(map);
  const base = map.getSource(railNetworkSourceId) as GeoJSONSource | undefined;
  const detail = map.getSource(railNetworkDetailSourceId) as GeoJSONSource | undefined;
  if (enabled && base && state && !state.baseRequested) {
    base.setData("/rail-network.geojson");
    state.baseRequested = true;
  }
  if (enabled && map.getZoom() >= 12 && detail && state && !state.detailRequested) {
    detail.setData("/rail-network-detail.geojson");
    state.detailRequested = true;
  }
  for (const id of [...railOperationalLayerIds, ...railConstructionLayerIds]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", enabled ? "visible" : "none");
  }
  for (const id of railDisusedLayerIds) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", enabled && showDisused ? "visible" : "none");
  }
  for (const id of railStationLayerIds) {
    if (!map.getLayer(id)) continue;
    map.setLayoutProperty(id, "visibility", enabled ? "visible" : "none");
    map.setFilter(id, (showDisused ? RAIL_STATION_BASE_FILTER : ["all", ...RAIL_STATION_BASE_FILTER.slice(1), ["!", ["in", ["get", "rail_status"], ["literal", ["disused", "preserved"]]]]]) as maplibregl.FilterSpecification);
  }
}

function entityLineColor(theme: AtlasTheme, muted = false): MapExpression {
  const colors = Object.entries(TRANSIT_LINE_COLORS).flatMap(([code, color]) => [code, muted ? TRANSIT_LINE_MUTED_COLORS[code] ?? (theme === "day" ? "#92999b" : "#68767b") : color]);
  return ["match", ["get", "entity_code"], ...colors, ["case", ["==", ["get", "type"], "road"], theme === "day" ? "#854a0a" : "#f0ad58", theme === "day" ? "#145e63" : "#53d8d2"]] as unknown as MapExpression;
}

function stationModeFilter(modes: readonly TransitMode[]): MapExpression {
  if (!modes.length) return ["==", ["get", "osm_node_id"], -1] as unknown as MapExpression;
  return ["any", ...modes.map((mode) => ["in", mode, ["get", "modes"]])] as unknown as MapExpression;
}

function iconImageForMode(mode: string): string {
  return `transit-${mode}`;
}

function addTransitIcons(map: MapLibreMap) {
  const modes = Object.keys(TRANSIT_MODE_LABELS);
  for (const mode of modes) {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.fillStyle = "#fff";
    context.beginPath();
    const cx = 24, cy = 24;
    if (mode === "metro" || mode === "metro_l4") {
      context.arc(cx, cy, 16, 0, Math.PI * 2);
    } else if (mode === "lrt") {
      context.roundRect(8, 8, 32, 32, 4);
    } else if (mode === "monorail_east") {
      context.moveTo(cx, 5); context.lineTo(43, cy); context.lineTo(cx, 43); context.lineTo(5, cy); context.closePath();
    } else if (mode === "monorail_west" || mode === "hsr" || mode === "unclassified") {
      for (let index = 0; index < 6; index++) {
        const angle = Math.PI / 3 * index - Math.PI / 2;
        const x = cx + 17 * Math.cos(angle), y = cy + 17 * Math.sin(angle);
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath();
    } else if (mode === "brt") {
      context.moveTo(cx, 5); context.lineTo(43, 41); context.lineTo(5, 41); context.closePath();
    } else {
      context.rect(18, 5, 12, 38); context.rect(5, 18, 38, 12);
    }
    context.fill();
    if (!map.hasImage(iconImageForMode(mode))) map.addImage(iconImageForMode(mode), context.getImageData(0, 0, 48, 48), { sdf: true, pixelRatio: 2 });
  }
}

function stationIconColor(): MapExpression {
  const full = Object.entries(TRANSIT_LINE_COLORS).flatMap(([code, color]) => [code, color]);
  const muted = Object.entries(TRANSIT_LINE_MUTED_COLORS).flatMap(([code, color]) => [code, color]);
  const fallback = ["case", ["==", ["at", 0, ["get", "modes"]], "metro"], "#c8202f", ["==", ["at", 0, ["get", "modes"]], "lrt"], "#b74831", ["==", ["at", 0, ["get", "modes"]], "monorail_east"], "#174d9b", ["==", ["at", 0, ["get", "modes"]], "monorail_west"], "#527da8", ["==", ["at", 0, ["get", "modes"]], "brt"], "#2477a8", ["==", ["at", 0, ["get", "modes"]], "hsr"], "#525e64", ["==", ["at", 0, ["get", "modes"]], "unclassified"], "#6c7475", "#925c2c"];
  return ["case", ["in", ["get", "status"], ["literal", ["under_construction", "planned", "approved_planned"]]], ["match", ["get", "primary_line_code"], ...muted, fallback], ["match", ["get", "primary_line_code"], ...full, fallback]] as unknown as MapExpression;
}

function visitPositions(geometry: unknown, visit: (point: [number, number]) => void) {
  if (!geometry || typeof geometry !== "object") return;
  const record=geometry as Record<string,unknown>;
  if (record.type === "GeometryCollection" && Array.isArray(record.geometries)) {
    record.geometries.forEach((child)=>visitPositions(child,visit));
    return;
  }
  const walk=(value:unknown):void=>{
    if (!Array.isArray(value))return;
    if (value.length>=2 && typeof value[0]==="number" && typeof value[1]==="number") {
      visit([value[0],value[1]]);return;
    }
    value.forEach(walk);
  };
  walk(record.coordinates);
}

function boundaryCollection(boundary: AreaBoundaryFeature | null): FeatureCollection {
  return { type: "FeatureCollection", features: boundary ? [boundary as unknown as FeatureCollection["features"][number]] : [] };
}

export function MapView({ theme, features, onSelect, onZoomChange, onStyleStatus, language, fitToFeatures = false, compact = false, showRoadNetwork = false, showRailNetwork = false, highlightBoundary = null, selectedCode = null, visibleTransitModes = Object.keys(TRANSIT_MODE_LABELS) as TransitMode[], showInterchanges = true, showDisusedRail = false, showAreaBoundaries = true }: {
  theme: AtlasTheme;
  features: AtlasFeatureCollection;
  onSelect: (entityCode: string) => void;
  onZoomChange: (zoom: number) => void;
  onStyleStatus: (status: MapStyleStatus) => void;
  language: "ar" | "en";
  fitToFeatures?: boolean;
  compact?: boolean;
  showRoadNetwork?: boolean;
  showRailNetwork?: boolean;
  showDisusedRail?: boolean;
  showAreaBoundaries?: boolean;
  highlightBoundary?: AreaBoundaryFeature | null;
  selectedCode?: string | null;
  visibleTransitModes?: readonly TransitMode[];
  showInterchanges?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const dataRef = useRef<AtlasFeatureCollection>(features);
  const showRoadNetworkRef = useRef(showRoadNetwork);
  const showRailNetworkRef = useRef(showRailNetwork);
  const showDisusedRailRef = useRef(false);
  const showAreaBoundariesRef = useRef(showAreaBoundaries);
  const boundaryRef = useRef<AreaBoundaryFeature | null>(highlightBoundary);
  const selectedCodeRef = useRef<string | null>(selectedCode);
  const visibleModesRef = useRef<readonly TransitMode[]>(visibleTransitModes);
  const showInterchangesRef = useRef(showInterchanges);
  const onSelectRef = useRef(onSelect);
  const onZoomRef = useRef(onZoomChange);
  const onStyleStatusRef = useRef(onStyleStatus);
  useEffect(() => {
    dataRef.current = features;
    boundaryRef.current = highlightBoundary;
    selectedCodeRef.current = selectedCode;
    showAreaBoundariesRef.current = showAreaBoundaries;
    visibleModesRef.current = visibleTransitModes;
    showInterchangesRef.current = showInterchanges;
    onSelectRef.current = onSelect;
    onZoomRef.current = onZoomChange;
    onStyleStatusRef.current = onStyleStatus;
  }, [features, highlightBoundary, selectedCode, showAreaBoundaries, visibleTransitModes, showInterchanges, onSelect, onZoomChange, onStyleStatus]);

  useEffect(() => {
    if (!containerRef.current) return;
    setMapReady(false);
    onStyleStatusRef.current("loading");
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getAtlasMapStyleUrl(theme),
      center: [31.25, 30.045],
      zoom: 9.2,
      minZoom: 6,
      maxZoom: 17,
      attributionControl: false,
      cooperativeGestures: !compact,
    });
    mapRef.current = map;
    const urlView = window.location.hash.slice(1).split("/").map(Number);
    if (urlView.length >= 3 && urlView.every(Number.isFinite)) map.jumpTo({ zoom: urlView[0]!, center: [urlView[2]!, urlView[1]!] });
    const syncUrlView = () => {
      const center = map.getCenter();
      const url = new URL(window.location.href);
      url.hash = `#${map.getZoom().toFixed(2)}/${center.lat.toFixed(5)}/${center.lng.toFixed(5)}`;
      window.history.replaceState({}, "", url);
    };
    map.on("moveend", syncUrlView);
    if (!compact) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    map.on("error", () => {
      if (!map.isStyleLoaded()) onStyleStatusRef.current("error");
    });
    map.on("style.load", () => onStyleStatusRef.current("ready"));
    map.on("load", () => {
      map.addSource(sourceId, { type: "geojson", data: dataRef.current as unknown as FeatureCollection });
      if (!compact) map.addSource(transitStationSourceId, { type: "geojson", data: "/transit-stations.geojson" });
      map.addSource(railNetworkSourceId, { type: "geojson", data: EMPTY_GEOJSON });
      map.addSource(railNetworkDetailSourceId, { type: "geojson", data: EMPTY_GEOJSON });
      railLoadStates.set(map, { baseRequested: false, detailRequested: false });
      addTransitIcons(map);
      map.addSource(boundarySourceId, { type: "geojson", data: boundaryCollection(boundaryRef.current) });
      if (!compact) {
        map.addSource(roadNetworkSourceId, { type: "geojson", data: "/road-network.geojson" });
        map.addSource(roadNetworkDetailSourceId, { type: "geojson", data: "/road-network-detail.geojson" });
        map.addLayer({
          id: roadNetworkLayerId, type: "line", source: roadNetworkSourceId, maxzoom: 11,
          paint: {
            "line-color": theme === "day" ? "#60756a" : "#7f9185",
            "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.35, 9, 0.75, 11, 0.95],
            "line-opacity": 0.34,
          },
          layout: {
            "line-cap": "round", "line-join": "round",
            visibility: showRoadNetworkRef.current ? "visible" : "none",
          },
        });
        map.addLayer({
          id: roadNetworkDetailLayerId, type: "line", source: roadNetworkDetailSourceId, minzoom: 11,
          paint: {
            "line-color": theme === "day" ? "#60756a" : "#7f9185",
            "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.9, 14, 1.25],
            "line-opacity": 0.34,
          },
          layout: {
            "line-cap": "round", "line-join": "round",
            visibility: showRoadNetworkRef.current ? "visible" : "none",
          },
        });
      }
      const addRailLineLayer = (id: string, source: string, status: string, color: string, dasharray?: number[], maxzoom?: number, minzoom?: number) => map.addLayer({
        id, type: "line", source, filter: ["==", ["get", "rail_status"], status],
        ...(maxzoom === undefined ? {} : { maxzoom }), ...(minzoom === undefined ? {} : { minzoom }),
        paint: { "line-color": color, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.45, 9, 0.95, 14, 1.5], "line-opacity": status === "operational" ? 0.78 : 0.62, ...(dasharray ? { "line-dasharray": dasharray } : {}) },
        layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
      });
      for (const [source, suffix, maxzoom, minzoom] of [[railNetworkSourceId, "low", 12, undefined], [railNetworkDetailSourceId, "detail", undefined, 12]] as const) {
        addRailLineLayer(`atlas-rail-operational-${suffix}`, source, "operational", theme === "day" ? "#79512e" : "#c29a6b", undefined, maxzoom, minzoom);
        addRailLineLayer(`atlas-rail-construction-${suffix}`, source, "under_construction", theme === "day" ? "#9a7454" : "#d7ad78", [2, 1.5], maxzoom, minzoom);
        addRailLineLayer(`atlas-rail-disused-${suffix}`, source, "disused", theme === "day" ? "#9b8d7d" : "#8e8375", [1, 2], maxzoom, minzoom);
        addRailLineLayer(`atlas-rail-preserved-${suffix}`, source, "preserved", theme === "day" ? "#9b8d7d" : "#8e8375", [1, 2], maxzoom, minzoom);
      }
      map.addLayer({
        id: boundaryFillLayerId, type: "fill", source: boundarySourceId,
        paint: { "fill-color": getComputedStyle(document.documentElement).getPropertyValue("--boundary-color").trim() || (theme === "day" ? "#116c62" : "#57d6c6"), "fill-opacity": 0.15 },
        layout: { visibility: showAreaBoundariesRef.current ? "visible" : "none" },
      });
      map.addLayer({
        id: "atlas-polygons-fill", type: "fill", source: sourceId,
        filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
        paint: { "fill-color": theme === "day" ? "#278d78" : "#55d7ba", "fill-opacity": 0.11 },
      });
      map.addLayer({
        id: "atlas-polygons-outline", type: "line", source: sourceId,
        filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
        paint: { "line-color": theme === "day" ? "#147364" : "#43bfa5", "line-width": 1.3, "line-opacity": 0.82 },
      });
      map.addLayer({
        id: "atlas-roads-casing", type: "line", source: sourceId,
        filter: ["==", ["get", "type"], "road"],
        paint: { "line-color": theme === "day" ? "#fff8e8" : "#23332f", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 3.4, 10, 7, 14, 10], "line-opacity": 0.92 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "atlas-lines-operational", type: "line", source: sourceId,
        filter: ["==", ["get", "status"], "operational"],
        paint: { "line-color": entityLineColor(theme), "line-width": ["interpolate", ["linear"], ["zoom"], 6, ["match", ["get", "type"], "road", 2.1, 1.6], 12, ["match", ["get", "type"], "road", 5.2, 3.7], 16, ["match", ["get", "type"], "road", 8, 5.5]], "line-opacity": 0.96 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "atlas-lines-partial", type: "line", source: sourceId,
        filter: ["==", ["get", "status"], "partial"],
        paint: { "line-color": entityLineColor(theme), "line-width": 3.2, "line-dasharray": [2, 1], "line-opacity": 0.95 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "atlas-lines-construction", type: "line", source: sourceId,
        filter: ["==", ["get", "status"], "under_construction"],
        paint: { "line-color": entityLineColor(theme, true), "line-width": 3, "line-dasharray": [1.5, 1.5], "line-opacity": 0.82 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "atlas-lines-planned", type: "line", source: sourceId,
        filter: ["in", ["get", "status"], ["literal", ["planned", "approved_planned"]]],
        paint: { "line-color": entityLineColor(theme, true), "line-width": 2.8, "line-dasharray": [0.6, 2.3], "line-opacity": 0.88 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "atlas-lines-unknown", type: "line", source: sourceId,
        filter: ["==", ["get", "status"], "unknown"],
        paint: { "line-color": ["match", ["get", "type"], "road", theme === "day" ? "#854a0a" : "#d39a55", theme === "day" ? "#58635b" : "#87938e"], "line-width": ["match", ["get", "type"], "road", 3.2, 1.8], "line-opacity": 0.82 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "atlas-points", type: "circle", source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "Point"], ["!", ["in", ["get", "type"], ["literal", ["transit_stop", "rail_station"]]]]],
        paint: { "circle-color": theme === "day" ? "#815c00" : "#f7d46a", "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2.5, 12, 5], "circle-stroke-color": theme === "day" ? "#fff" : "#111715", "circle-stroke-width": 1.5 },
      });
      if (!compact) {
        map.addLayer({
          id: "atlas-transit-interchange-ring", type: "circle", source: transitStationSourceId,
          filter: ["all", ["==", ["get", "interchange"], true], stationModeFilter(visibleModesRef.current)],
          paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 6, 12, 9, 16, 13], "circle-color": "rgba(0,0,0,0)", "circle-opacity": 0, "circle-stroke-color": theme === "day" ? "#172221" : "#f1f6f4", "circle-stroke-width": 2.1 },
        });
      }
      map.addLayer({
        id: "atlas-station-entity-interchange-ring", type: "circle", source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "interchange"], true], stationModeFilter(visibleModesRef.current)],
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 5, 12, 8, 16, 11], "circle-color": "rgba(0,0,0,0)", "circle-opacity": 0, "circle-stroke-color": theme === "day" ? "#172221" : "#f1f6f4", "circle-stroke-width": 2.1 },
      });
      if (!compact) {
        map.addLayer({
          id: "atlas-transit-station-icons", type: "symbol", source: transitStationSourceId,
          filter: stationModeFilter(visibleModesRef.current),
          layout: { "icon-image": ["match", ["get", "mode"], ...Object.keys(TRANSIT_MODE_LABELS).flatMap((mode) => [mode, iconImageForMode(mode)]), "transit-enr"] as unknown as MapExpression, "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.37, 10, 0.55, 14, 0.76], "icon-allow-overlap": true, "icon-ignore-placement": false, "icon-padding": 1 },
          paint: { "icon-color": stationIconColor(), "icon-halo-color": theme === "day" ? "#fff" : "#15201e", "icon-halo-width": 1.2 },
        });
      }
      map.addLayer({
        id: "atlas-station-entity-icons", type: "symbol", source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "Point"], ["in", ["get", "type"], ["literal", ["transit_stop", "rail_station"]]], stationModeFilter(visibleModesRef.current)],
        layout: { "icon-image": ["match", ["at", 0, ["get", "modes"]], ...Object.keys(TRANSIT_MODE_LABELS).flatMap((mode) => [mode, iconImageForMode(mode)]), "transit-enr"] as unknown as MapExpression, "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.37, 10, 0.55, 14, 0.76], "icon-allow-overlap": true, "icon-padding": 1 },
        paint: { "icon-color": stationIconColor(), "icon-halo-color": theme === "day" ? "#fff" : "#15201e", "icon-halo-width": 1.2 },
      });
      if (!compact) {
        map.addLayer({
          id: "atlas-transit-station-labels", type: "symbol", source: transitStationSourceId, minzoom: 13.5,
          filter: stationModeFilter(visibleModesRef.current),
          layout: { "text-field": ["coalesce", ["get", language === "ar" ? "name_ar" : "name_en"], ["get", "name"]], "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 13.5, 9, 17, 12], "text-offset": [0, 1.1], "text-anchor": "top", "text-max-width": 9, "text-allow-overlap": false },
          paint: { "text-color": theme === "day" ? "#172322" : "#f4f7f4", "text-halo-color": theme === "day" ? "#fff" : "#111715", "text-halo-width": 1.25 },
        });
      }
      map.addLayer({
        id: "atlas-station-entity-labels", type: "symbol", source: sourceId, minzoom: 13.5,
        filter: ["all", ["==", ["geometry-type"], "Point"], ["in", ["get", "type"], ["literal", ["transit_stop", "rail_station"]]], stationModeFilter(visibleModesRef.current)],
        layout: { "text-field": ["coalesce", ["get", language === "ar" ? "name_ar" : "name_en"]], "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 13.5, 9, 17, 12], "text-offset": [0, 1.1], "text-anchor": "top", "text-max-width": 9, "text-allow-overlap": false },
        paint: { "text-color": theme === "day" ? "#172322" : "#f4f7f4", "text-halo-color": theme === "day" ? "#fff" : "#111715", "text-halo-width": 1.25 },
      });
      if (!compact) {
        map.addLayer({
          id: "atlas-rail-stations", type: "symbol", source: railNetworkSourceId,
          filter: ["all", ["==", ["geometry-type"], "Point"], ["in", ["get", "railway"], ["literal", ["station", "halt"]]]],
          paint: { "icon-color": theme === "day" ? "#825126" : "#d2a16e", "icon-halo-color": theme === "day" ? "#fff" : "#15201e", "icon-halo-width": 1.2 },
          layout: { visibility: "none", "icon-image": "transit-enr", "icon-size": ["interpolate", ["linear"], ["zoom"], 6, ["case", ["==", ["get", "railway"], "halt"], 0.25, 0.34], 10, ["case", ["==", ["get", "railway"], "halt"], 0.38, 0.52], 14, ["case", ["==", ["get", "railway"], "halt"], 0.55, 0.72]], "icon-allow-overlap": true, "icon-padding": 1 },
        });
        map.addLayer({
          id: "atlas-rail-station-labels", type: "symbol", source: railNetworkSourceId, minzoom: 13.5,
          filter: ["all", ["==", ["geometry-type"], "Point"], ["in", ["get", "railway"], ["literal", ["station", "halt"]]]],
          layout: { visibility: "none", "text-field": ["coalesce", ["get", language === "ar" ? "name_ar" : "name_en"], ["get", "name"]], "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"], "text-size": 10, "text-offset": [0, 1.1], "text-anchor": "top", "text-max-width": 9, "text-allow-overlap": false },
          paint: { "text-color": theme === "day" ? "#172322" : "#f4f7f4", "text-halo-color": theme === "day" ? "#fff" : "#111715", "text-halo-width": 1.25 },
        });
      }
      map.addLayer({
        id: boundaryOutlineLayerId, type: "line", source: boundarySourceId,
        paint: { "line-color": getComputedStyle(document.documentElement).getPropertyValue("--boundary-color").trim() || (theme === "day" ? "#116c62" : "#57d6c6"), "line-width": 2, "line-opacity": 0.98 },
        layout: { "line-cap": "round", "line-join": "round", visibility: showAreaBoundariesRef.current ? "visible" : "none" },
      });
      map.addLayer({
        id: "atlas-selected-polygon-fill", type: "fill", source: sourceId,
        filter: ["==", ["get", "entity_code"], "__none__"],
        paint: { "fill-color": "#fff36d", "fill-opacity": 0.3 },
      });
      map.addLayer({
        id: "atlas-selected-outline", type: "line", source: sourceId,
        filter: ["==", ["get", "entity_code"], "__none__"],
        paint: { "line-color": "#fff36d", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 4, 14, 8], "line-opacity": 1 },
      });
      map.addLayer({
        id: "atlas-selected-point-halo", type: "circle", source: sourceId,
        filter: ["all", ["==", ["get", "entity_code"], "__none__"], ["==", ["geometry-type"], "Point"]],
        paint: { "circle-radius": 15, "circle-color": "#fff36d", "circle-opacity": 0.4, "circle-stroke-color": "#fff36d", "circle-stroke-width": 3 },
      });
      setMapReady(true);
      syncRailLayers(map, showRailNetworkRef.current, showDisusedRailRef.current);
      map.on("zoomend", () => syncRailLayers(map, showRailNetworkRef.current, showDisusedRailRef.current));
      map.on("click", (event: MapLayerMouseEvent) => {
        const found = map.queryRenderedFeatures(event.point, { layers: lineLayers.filter((layerId) => map.getLayer(layerId)) });
        const properties = found[0]?.properties;
        const code = properties?.entity_code ?? (Array.isArray(properties?.entity_codes) ? properties.entity_codes.find((value): value is string => typeof value === "string") : undefined);
        if (typeof code === "string") onSelectRef.current(code);
      });
      map.on("mousemove", (event: MapLayerMouseEvent) => {
        const found = map.queryRenderedFeatures(event.point, { layers: lineLayers.filter((layerId) => map.getLayer(layerId)) });
        map.getCanvas().style.cursor = found.length ? "pointer" : "";
      });
      if (boundaryRef.current || (fitToFeatures && dataRef.current.features.length > 0)) {
        const bounds = new maplibregl.LngLatBounds();
        if (boundaryRef.current) visitPositions(boundaryRef.current.geometry, (point) => bounds.extend(point));
        else for (const feature of dataRef.current.features) {
          visitPositions(feature.geometry, (point) => bounds.extend(point));
        }
        if (!bounds.isEmpty()) {
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          if (Math.abs(ne.lng - sw.lng) < 0.0005 && Math.abs(ne.lat - sw.lat) < 0.0005) {
            map.setCenter(bounds.getCenter());
            map.setZoom(compact ? 13 : 11);
          } else {
            map.fitBounds(bounds, { padding: compact ? 28 : 54, maxZoom: compact ? 14 : 15, duration: 0 });
          }
        }
      }
      onZoomRef.current(Math.round(map.getZoom()));
      requestAnimationFrame(() => map.resize());
    });
    map.on("zoomend", () => onZoomRef.current(Math.round(map.getZoom())));
    return () => { map.remove(); mapRef.current = null; };
  }, [theme, compact, fitToFeatures, language]);

  useEffect(() => {
    const source = mapRef.current?.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(features as unknown as FeatureCollection);
  }, [features]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const selectedFilter: maplibregl.FilterSpecification = ["==", ["get", "entity_code"], selectedCode ?? "__none__"];
    for (const id of ["atlas-selected-polygon-fill", "atlas-selected-outline"]) {
      if (map.getLayer(id)) map.setFilter(id, selectedFilter);
    }
    if (map.getLayer("atlas-selected-point-halo")) map.setFilter("atlas-selected-point-halo", ["all", selectedFilter, ["==", ["geometry-type"], "Point"]]);
    if (!selectedCode) return;
    const selected = features.features.filter((feature) => feature.properties.entity_code === selectedCode);
    if (!selected.length) return;
    const bounds = new maplibregl.LngLatBounds();
    selected.forEach((feature) => visitPositions(feature.geometry, (point) => bounds.extend(point)));
    if (bounds.isEmpty()) return;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    if (Math.abs(ne.lng - sw.lng) < 0.0005 && Math.abs(ne.lat - sw.lat) < 0.0005) {
      map.flyTo({ center: bounds.getCenter(), zoom: Math.max(map.getZoom(), compact ? 13 : 14), duration: 650 });
    } else {
      map.fitBounds(bounds, { padding: compact ? 28 : 90, maxZoom: compact ? 14 : 15, duration: 650 });
    }
  }, [selectedCode, features, mapReady, compact]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(boundarySourceId) as GeoJSONSource | undefined;
    source?.setData(boundaryCollection(highlightBoundary));
    if (map && highlightBoundary) {
      const bounds = new maplibregl.LngLatBounds();
      visitPositions(highlightBoundary.geometry, (point) => bounds.extend(point));
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: compact ? 28 : 70, maxZoom: compact ? 14 : 14, duration: 650 });
    }
  }, [highlightBoundary, compact]);

  useEffect(() => {
    visibleModesRef.current = visibleTransitModes;
    showInterchangesRef.current = showInterchanges;
    const map = mapRef.current;
    for (const layerId of [...stationIconLayers, ...stationRingLayers, ...stationLabelLayers]) {
      if (!map?.getLayer(layerId)) continue;
      const modeFilter = stationModeFilter(visibleTransitModes);
      const isRing = stationRingLayers.includes(layerId);
      map.setFilter(layerId, isRing
        ? (showInterchanges ? ["all", modeFilter, ["==", ["get", "interchange"], true]] : ["==", ["get", "osm_node_id"], -1]) as maplibregl.FilterSpecification
        : modeFilter as maplibregl.FilterSpecification);
    }
  }, [visibleTransitModes, showInterchanges]);

  useEffect(() => {
    showAreaBoundariesRef.current = showAreaBoundaries;
    const map = mapRef.current;
    for (const id of [boundaryFillLayerId, boundaryOutlineLayerId]) {
      if (map?.getLayer(id)) map.setLayoutProperty(id, "visibility", showAreaBoundaries ? "visible" : "none");
    }
  }, [showAreaBoundaries]);

  useEffect(() => {
    showRoadNetworkRef.current = showRoadNetwork;
    const map = mapRef.current;
    for (const layerId of [roadNetworkLayerId, roadNetworkDetailLayerId]) {
      if (map?.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", showRoadNetwork ? "visible" : "none");
      }
    }
  }, [showRoadNetwork]);

  useEffect(() => {
    showRailNetworkRef.current = showRailNetwork;
    const map = mapRef.current;
    if (map) syncRailLayers(map, showRailNetwork, showDisusedRailRef.current);
  }, [showRailNetwork]);

  useEffect(() => {
    showDisusedRailRef.current = showDisusedRail;
    const map = mapRef.current;
    if (map) syncRailLayers(map, showRailNetworkRef.current, showDisusedRail);
  }, [showDisusedRail]);

  return <div className="map-canvas" ref={containerRef} tabIndex={0} role="application" aria-label={language === "ar" ? "خريطة تفاعلية للقاهرة الكبرى" : "Interactive Greater Cairo map"} />;
}
