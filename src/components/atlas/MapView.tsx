"use client";

import { useEffect, useRef } from "react";
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
const railNetworkLayerId = "atlas-rail-network-lines";
const transitStationSourceId = "atlas-transit-stations";
const boundarySourceId = "atlas-area-boundary";
const boundaryFillLayerId = "atlas-area-boundary-fill";
const boundaryOutlineLayerId = "atlas-area-boundary-outline";
const stationIconLayers = ["atlas-station-entity-icons", "atlas-transit-station-icons"];
const stationLabelLayers = ["atlas-transit-station-labels", "atlas-station-entity-labels"];
const stationRingLayers = ["atlas-station-entity-interchange-ring", "atlas-transit-interchange-ring"];
const lineLayers = [railNetworkLayerId, "atlas-roads-casing", "atlas-lines-operational", "atlas-lines-partial", "atlas-lines-construction", "atlas-lines-planned", "atlas-lines-unknown", "atlas-points", ...stationIconLayers];

type MapExpression = import("maplibre-gl").ExpressionSpecification;

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

export function MapView({ theme, features, onSelect, onZoomChange, onStyleStatus, language, fitToFeatures = false, compact = false, showRoadNetwork = false, showRailNetwork = false, highlightBoundary = null, visibleTransitModes = Object.keys(TRANSIT_MODE_LABELS) as TransitMode[], showInterchanges = true }: {
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
  highlightBoundary?: AreaBoundaryFeature | null;
  visibleTransitModes?: readonly TransitMode[];
  showInterchanges?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const dataRef = useRef<AtlasFeatureCollection>(features);
  const showRoadNetworkRef = useRef(showRoadNetwork);
  const showRailNetworkRef = useRef(showRailNetwork);
  const boundaryRef = useRef<AreaBoundaryFeature | null>(highlightBoundary);
  const visibleModesRef = useRef<readonly TransitMode[]>(visibleTransitModes);
  const showInterchangesRef = useRef(showInterchanges);
  const onSelectRef = useRef(onSelect);
  const onZoomRef = useRef(onZoomChange);
  const onStyleStatusRef = useRef(onStyleStatus);
  useEffect(() => {
    dataRef.current = features;
    boundaryRef.current = highlightBoundary;
    visibleModesRef.current = visibleTransitModes;
    showInterchangesRef.current = showInterchanges;
    onSelectRef.current = onSelect;
    onZoomRef.current = onZoomChange;
    onStyleStatusRef.current = onStyleStatus;
  }, [features, highlightBoundary, visibleTransitModes, showInterchanges, onSelect, onZoomChange, onStyleStatus]);

  useEffect(() => {
    if (!containerRef.current) return;
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
    if (!compact) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    map.on("error", () => {
      if (!map.isStyleLoaded()) onStyleStatusRef.current("error");
    });
    map.on("style.load", () => onStyleStatusRef.current("ready"));
    map.on("load", () => {
      map.addSource(sourceId, { type: "geojson", data: dataRef.current as unknown as FeatureCollection });
      if (!compact) map.addSource(transitStationSourceId, { type: "geojson", data: "/transit-stations.geojson" });
      map.addSource(railNetworkSourceId, { type: "geojson", data: "/rail-network.geojson" });
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
        map.addLayer({
          id: railNetworkLayerId, type: "line", source: railNetworkSourceId,
          paint: { "line-color": theme === "day" ? "#8d653c" : "#c29a6b", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.45, 9, 0.95, 14, 1.5], "line-opacity": 0.76 },
          layout: { "line-cap": "round", "line-join": "round", visibility: showRailNetworkRef.current ? "visible" : "none" },
        });
      map.addLayer({
        id: boundaryFillLayerId, type: "fill", source: boundarySourceId,
        paint: { "fill-color": getComputedStyle(document.documentElement).getPropertyValue("--boundary-color").trim() || (theme === "day" ? "#116c62" : "#57d6c6"), "fill-opacity": 0.15 },
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
      map.addLayer({
        id: boundaryOutlineLayerId, type: "line", source: boundarySourceId,
        paint: { "line-color": getComputedStyle(document.documentElement).getPropertyValue("--boundary-color").trim() || (theme === "day" ? "#116c62" : "#57d6c6"), "line-width": 2, "line-opacity": 0.98 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
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
    if (map?.getLayer(railNetworkLayerId)) map.setLayoutProperty(railNetworkLayerId, "visibility", showRailNetwork ? "visible" : "none");
  }, [showRailNetwork]);

  return <div className="map-canvas" ref={containerRef} tabIndex={0} role="application" aria-label={language === "ar" ? "خريطة تفاعلية للقاهرة الكبرى" : "Interactive Greater Cairo map"} />;
}
