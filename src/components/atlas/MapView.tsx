"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { AtlasFeatureCollection, AtlasTheme } from "./atlas-client";

const sourceId = "atlas-features";
const lineLayers = ["atlas-lines-operational", "atlas-lines-partial", "atlas-lines-construction", "atlas-lines-planned", "atlas-lines-unknown", "atlas-points"];

export function MapView({ theme, features, onSelect, onZoomChange, language }: {
  theme: AtlasTheme;
  features: AtlasFeatureCollection;
  onSelect: (entityCode: string) => void;
  onZoomChange: (zoom: number) => void;
  language: "ar" | "en";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const dataRef = useRef<AtlasFeatureCollection>(features);
  const onSelectRef = useRef(onSelect);
  const onZoomRef = useRef(onZoomChange);
  useEffect(() => {
    dataRef.current = features;
    onSelectRef.current = onSelect;
    onZoomRef.current = onZoomChange;
  }, [features, onSelect, onZoomChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: theme === "day" ? "https://tiles.openfreemap.org/styles/positron" : "https://tiles.openfreemap.org/styles/dark",
      center: [31.25, 30.045],
      zoom: 9.2,
      minZoom: 6,
      maxZoom: 17,
      attributionControl: false,
      cooperativeGestures: true,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    map.on("load", () => {
      map.addSource(sourceId, { type: "geojson", data: dataRef.current as unknown as FeatureCollection });
      map.addLayer({
        id: "atlas-lines-operational", type: "line", source: sourceId,
        filter: ["==", ["get", "status"], "operational"],
        paint: { "line-color": ["match", ["get", "type"], "road", "#e6a85c", "transit_line", "#53d8d2", "#99a8b5"], "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.8, 12, 4.2], "line-opacity": 0.92 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "atlas-lines-partial", type: "line", source: sourceId,
        filter: ["==", ["get", "status"], "partial"],
        paint: { "line-color": ["match", ["get", "type"], "road", "#e6a85c", "transit_line", "#53d8d2", "#99a8b5"], "line-width": 3.2, "line-dasharray": [2, 1], "line-opacity": 0.95 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "atlas-lines-construction", type: "line", source: sourceId,
        filter: ["==", ["get", "status"], "under_construction"],
        paint: { "line-color": ["match", ["get", "type"], "road", "#e6a85c", "transit_line", "#53d8d2", "#99a8b5"], "line-width": 3, "line-dasharray": [1.5, 1.5], "line-opacity": 0.9 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "atlas-lines-planned", type: "line", source: sourceId,
        filter: ["in", ["get", "status"], ["literal", ["planned", "approved_planned"]]],
        paint: { "line-color": "#a89af1", "line-width": 2.6, "line-dasharray": [0.6, 2.3], "line-opacity": 0.8 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "atlas-lines-unknown", type: "line", source: sourceId,
        filter: ["==", ["get", "status"], "unknown"],
        paint: { "line-color": "#87938e", "line-width": 1.8, "line-opacity": 0.72 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "atlas-points", type: "circle", source: sourceId,
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-color": "#f7d46a", "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2.5, 12, 5], "circle-stroke-color": theme === "day" ? "#fff" : "#111715", "circle-stroke-width": 1.5 },
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
      onZoomRef.current(Math.round(map.getZoom()));
      requestAnimationFrame(() => map.resize());
    });
    map.on("zoomend", () => onZoomRef.current(Math.round(map.getZoom())));
    return () => { map.remove(); mapRef.current = null; };
  }, [theme]);

  useEffect(() => {
    const source = mapRef.current?.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(features as unknown as FeatureCollection);
  }, [features]);

  return <div className="map-canvas" ref={containerRef} tabIndex={0} role="application" aria-label={language === "ar" ? "خريطة تفاعلية للقاهرة الكبرى" : "Interactive Greater Cairo map"} />;
}
