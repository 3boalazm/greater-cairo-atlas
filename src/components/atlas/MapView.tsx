"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { AtlasFeatureCollection, AtlasTheme } from "./atlas-client";
import type { AreaBoundaryFeature } from "@/lib/atlas/area-boundaries";
import { getAtlasMapStyleUrl } from "./map-styles";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

export type MapStyleStatus = "loading" | "ready" | "error";

const sourceId = "atlas-features";
const roadNetworkSourceId = "atlas-road-network";
const roadNetworkDetailSourceId = "atlas-road-network-detail";
const roadNetworkLayerId = "atlas-road-network-lines";
const roadNetworkDetailLayerId = "atlas-road-network-detail-lines";
const boundarySourceId = "atlas-area-boundary";
const boundaryFillLayerId = "atlas-area-boundary-fill";
const boundaryOutlineLayerId = "atlas-area-boundary-outline";
const lineLayers = ["atlas-roads-casing", "atlas-lines-operational", "atlas-lines-partial", "atlas-lines-construction", "atlas-lines-planned", "atlas-lines-unknown", "atlas-points"];

type EntityLineColorExpression = ["match", ["get", "type"], "road", string, "transit_line", string, string];

type PlannedLineColorExpression = ["match", ["get", "type"], "road", string, string];

function entityLineColor(theme: AtlasTheme): EntityLineColorExpression {
  return ["match", ["get", "type"], "road", theme === "day" ? "#854a0a" : "#f0ad58", "transit_line", theme === "day" ? "#145e63" : "#53d8d2", theme === "day" ? "#58635b" : "#99a8b5"];
}

function plannedLineColor(theme: AtlasTheme): PlannedLineColorExpression {
  return ["match", ["get", "type"], "road", theme === "day" ? "#854a0a" : "#d39a55", theme === "day" ? "#51458a" : "#a89af1"];
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

export function MapView({ theme, features, onSelect, onZoomChange, onStyleStatus, language, fitToFeatures = false, compact = false, showRoadNetwork = false, highlightBoundary = null }: {
  theme: AtlasTheme;
  features: AtlasFeatureCollection;
  onSelect: (entityCode: string) => void;
  onZoomChange: (zoom: number) => void;
  onStyleStatus: (status: MapStyleStatus) => void;
  language: "ar" | "en";
  fitToFeatures?: boolean;
  compact?: boolean;
  showRoadNetwork?: boolean;
  highlightBoundary?: AreaBoundaryFeature | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const dataRef = useRef<AtlasFeatureCollection>(features);
  const showRoadNetworkRef = useRef(showRoadNetwork);
  const boundaryRef = useRef<AreaBoundaryFeature | null>(highlightBoundary);
  const onSelectRef = useRef(onSelect);
  const onZoomRef = useRef(onZoomChange);
  const onStyleStatusRef = useRef(onStyleStatus);
  useEffect(() => {
    dataRef.current = features;
    boundaryRef.current = highlightBoundary;
    onSelectRef.current = onSelect;
    onZoomRef.current = onZoomChange;
    onStyleStatusRef.current = onStyleStatus;
  }, [features, highlightBoundary, onSelect, onZoomChange, onStyleStatus]);

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
        paint: { "line-color": entityLineColor(theme), "line-width": 3, "line-dasharray": [1.5, 1.5], "line-opacity": 0.9 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "atlas-lines-planned", type: "line", source: sourceId,
        filter: ["in", ["get", "status"], ["literal", ["planned", "approved_planned"]]],
        paint: { "line-color": plannedLineColor(theme), "line-width": 2.8, "line-dasharray": [0.6, 2.3], "line-opacity": 0.88 },
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
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-color": theme === "day" ? "#815c00" : "#f7d46a", "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2.5, 12, 5], "circle-stroke-color": theme === "day" ? "#fff" : "#111715", "circle-stroke-width": 1.5 },
      });
      map.addLayer({
        id: boundaryOutlineLayerId, type: "line", source: boundarySourceId,
        paint: { "line-color": getComputedStyle(document.documentElement).getPropertyValue("--boundary-color").trim() || (theme === "day" ? "#116c62" : "#57d6c6"), "line-width": 2, "line-opacity": 0.98 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.on("click", (event: MapLayerMouseEvent) => {
        const found = map.queryRenderedFeatures(event.point, { layers: lineLayers });
        const code = found[0]?.properties?.entity_code;
        if (typeof code === "string") onSelectRef.current(code);
      });
      map.on("mousemove", (event: MapLayerMouseEvent) => {
        const found = map.queryRenderedFeatures(event.point, { layers: lineLayers });
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
  }, [theme, compact, fitToFeatures]);

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
    showRoadNetworkRef.current = showRoadNetwork;
    const map = mapRef.current;
    for (const layerId of [roadNetworkLayerId, roadNetworkDetailLayerId]) {
      if (map?.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", showRoadNetwork ? "visible" : "none");
      }
    }
  }, [showRoadNetwork]);

  return <div className="map-canvas" ref={containerRef} tabIndex={0} role="application" aria-label={language === "ar" ? "خريطة تفاعلية للقاهرة الكبرى" : "Interactive Greater Cairo map"} />;
}
