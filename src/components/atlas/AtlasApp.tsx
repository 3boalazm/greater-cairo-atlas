"use client";
/* eslint-disable react-hooks/set-state-in-effect -- fetch lifecycle and URL hydration synchronize external state. */

import Link from "next/link";
import { AlertTriangle, Database, MapPinned, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { ActiveFilterChips, AtlasFilters, LayerChips, LayerGroupToggles, Legend, MapFilters, TransitLineToggles, type AtlasLayerGroup, type AtlasLayerGroupState } from "./AtlasControls";
import { EntityPanel } from "./EntityPanel";
import dynamic from "next/dynamic";
import type { MapStyleStatus } from "./MapView";
import { TransitModeFilter } from "./TransitModeFilter";
import { TRANSIT_MODE_ORDER, TRANSIT_LINE_COLORS, type TransitMode } from "@/lib/atlas/transit-modes";
import { isTransitFeatureType, transitFeatureVisible, transitLineEnabled } from "@/lib/atlas/transit-feature-filters";
import type { AreaBoundaryFeature } from "@/lib/atlas/area-boundaries";

const MapView = dynamic(
  () => import("./MapView").then((module) => module.MapView),
  { ssr: false, loading: () => <div className="map-canvas map-canvas-loading" role="status">Loading interactive map…</div> },
);
import { ThemeToggle, useAtlasPreferences } from "./Preferences";
import { SiteLanguageSwitch } from "@/components/site/SiteLanguageSwitch";
import { SearchCommand } from "./SearchCommand";
import { ResearchModeToggle, ResearcherOnly, useResearchMode } from "@/components/site/ResearchMode";
import { FirstVisitGuide } from "./FirstVisitGuide";
import type { AtlasEntityDetail, AtlasEntitySummary, AtlasFeatureCollection, AtlasStatsResponse, AtlasTimelineStatusFact, EntityListResponse } from "./atlas-client";
import { resolveStatusByYear, timelineSummary, timelineYearRange } from "@/lib/atlas/status-timeline";
import { TimeControl } from "./TimeControl";
import { approximateRadiusPolygon } from "@/lib/atlas/service-area";
import { findGeometryAlternatives } from "@/lib/atlas/geometry-comparisons";
import { STATUSES } from "./atlas-client";

const emptyFilters: AtlasFilters = { type: "", sector: "", status: "", mappedOnly: false };
const defaultLayerGroups: AtlasLayerGroupState = { infrastructure: true, transport: true, areas: true, projects: true, reference: true };

function messageFrom(error: unknown, language: "ar" | "en") {
  return error instanceof Error ? error.message : language === "ar" ? "تعذر الاتصال بالخدمة." : "Could not connect to the service.";
}

export default function AtlasApp({ initialEntities, initialFeatures, initialStats, initialLanguage, regionalCodes, statusTimeline }: {
  initialEntities: AtlasEntitySummary[];
  initialFeatures: AtlasFeatureCollection;
  initialStats: AtlasStatsResponse;
  initialLanguage: "ar" | "en";
  regionalCodes: string[];
  statusTimeline: AtlasTimelineStatusFact[];
}) {
  const { theme, setTheme, language } = useAtlasPreferences(initialLanguage);
  const { researcherMode } = useResearchMode();
  const [filters, setFilters] = useState<AtlasFilters>(emptyFilters);
  const [quickLayer, setQuickLayer] = useState("");
  /**
   * BATCH 14.1 — the default year is *today*, so a visitor who never touches «الزمن» sees exactly the map
   * they saw before this feature existed. The range comes from the resolver so the slider cannot offer a
   * year no claim covers, nor stop before a planned opening that is still in the future.
   */
  const timeRange = useMemo(() => timelineYearRange(statusTimeline), [statusTimeline]);
  const [timelineEnabled, setTimelineEnabled] = useState(false);
  const [serviceRadiusMeters, setServiceRadiusMeters] = useState<0 | 500 | 1000>(0);
  const [timelineYear, setTimelineYear] = useState(() => timeRange.max);
  const [layerGroups, setLayerGroups] = useState<AtlasLayerGroupState>(defaultLayerGroups);
  const [entities, setEntities] = useState<AtlasEntitySummary[]>(initialEntities);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entitiesError, setEntitiesError] = useState<string | null>(null);
  const [adminUnitFeatures, setAdminUnitFeatures] = useState<AtlasFeatureCollection["features"]>([]);
  const [features, setFeatures] = useState<AtlasFeatureCollection>(initialFeatures);
  const [showAdminBoundaries, setShowAdminBoundaries] = useState(false);
  const [selectedAdminUnit, setSelectedAdminUnit] = useState<AtlasFeatureCollection["features"][number] | null>(null);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featuresError, setFeaturesError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(9);
  const [showRoadNetwork, setShowRoadNetwork] = useState(true);
  const [railNetworkAvailable, setRailNetworkAvailable] = useState(false);
  const [showRailNetwork, setShowRailNetwork] = useState(false);
  const [showDisusedRail, setShowDisusedRail] = useState(false);
  const [visibleTransitModes, setVisibleTransitModes] = useState<TransitMode[]>([...TRANSIT_MODE_ORDER]);
  const [visibleTransitLines, setVisibleTransitLines] = useState<string[]>(Object.keys(TRANSIT_LINE_COLORS));
  const [showInterchanges, setShowInterchanges] = useState(true);
  const [mapStyleStatus, setMapStyleStatus] = useState<MapStyleStatus>("loading");
  const [mapGeneration, setMapGeneration] = useState(0);
  const [stats, setStats] = useState<AtlasStatsResponse | null>(initialStats);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<AtlasEntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [highlightBoundary, setHighlightBoundary] = useState<AreaBoundaryFeature | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  /** A code whose boundary the user switched off by hand; auto-load must not fight that choice. */
  const [boundaryDismissedCode, setBoundaryDismissedCode] = useState<string | null>(null);
  const [boundaryLoadingCode, setBoundaryLoadingCode] = useState<string | null>(null);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const preferencesHydrated = useRef(false);
  const previousResearcherMode = useRef<boolean | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("entity");
    if (fromUrl) setSelectedCode(fromUrl);
    let canRestoreResearchState = false;
    try { canRestoreResearchState = localStorage.getItem("gca-researcher-mode") === "true"; } catch { /* Simple defaults are safest when storage is unavailable. */ }
    const hasUrlState = ["type", "sector", "status", "mapped", "quick", "layers", "year", "settings"].some((key) => params.has(key));
    let saved: { filters?: AtlasFilters; quickLayer?: string; layerGroups?: AtlasLayerGroupState; visibleTransitModes?: TransitMode[]; visibleTransitLines?: string[]; showRoadNetwork?: boolean; showRailNetwork?: boolean; showDisusedRail?: boolean; showInterchanges?: boolean } = {};
    if (canRestoreResearchState && !hasUrlState) {
      try { saved = JSON.parse(window.localStorage.getItem("gca-map-state") ?? "{}"); } catch { saved = {}; }
    }
    if (canRestoreResearchState) {
      setFilters({
        type: params.get("type") ?? saved.filters?.type ?? "",
        sector: params.get("sector") ?? saved.filters?.sector ?? "",
        status: params.get("status") ?? saved.filters?.status ?? "",
        mappedOnly: params.has("mapped") ? params.get("mapped") === "true" : saved.filters?.mappedOnly ?? false,
      });
      setQuickLayer(params.get("quick") ?? saved.quickLayer ?? "");
      const requestedGroups = params.get("layers")?.split(",");
      if (requestedGroups) setLayerGroups(Object.fromEntries(Object.keys(defaultLayerGroups).map((key) => [key, requestedGroups.includes(key)])) as AtlasLayerGroupState);
      else if (saved.layerGroups) setLayerGroups({ ...defaultLayerGroups, ...saved.layerGroups });
      const modes = params.get("modes")?.split(",").filter((mode): mode is TransitMode => TRANSIT_MODE_ORDER.includes(mode as TransitMode));
      if (modes) setVisibleTransitModes(modes);
      else if (saved.visibleTransitModes) setVisibleTransitModes(saved.visibleTransitModes.filter((mode) => TRANSIT_MODE_ORDER.includes(mode)));
      const lineCodes = params.get("lines")?.split(",");
      if (lineCodes) setVisibleTransitLines(lineCodes.filter((code) => code in TRANSIT_LINE_COLORS));
      else if (saved.visibleTransitLines) setVisibleTransitLines(saved.visibleTransitLines.filter((code) => code in TRANSIT_LINE_COLORS));
      const reference = params.get("reference")?.split(",") ?? [];
      if (params.has("reference")) { setShowRoadNetwork(reference.includes("roads")); setShowRailNetwork(reference.includes("rail")); setShowDisusedRail(reference.includes("disused")); }
      else { if (typeof saved.showRoadNetwork === "boolean") setShowRoadNetwork(saved.showRoadNetwork); if (typeof saved.showRailNetwork === "boolean") setShowRailNetwork(saved.showRailNetwork); if (typeof saved.showDisusedRail === "boolean") setShowDisusedRail(saved.showDisusedRail); }
      if (typeof saved.showInterchanges === "boolean") setShowInterchanges(saved.showInterchanges);
    }
    // BATCH 14.1 — a shared link carries its year; opening it must show that year, not today.
    const urlYear = Number.parseInt(params.get("year") ?? "", 10);
    if (Number.isFinite(urlYear) && urlYear >= timeRange.min && urlYear <= timeRange.max) setTimelineYear(urlYear);
    preferencesHydrated.current = true;
    const onPopState = () => {
      const next = new URLSearchParams(window.location.search);
      setSelectedCode(next.get("entity"));
      try { if (localStorage.getItem("gca-researcher-mode") !== "true") return; } catch { return; }
      setFilters({ type: next.get("type") ?? "", sector: next.get("sector") ?? "", status: next.get("status") ?? "", mappedOnly: next.get("mapped") === "true" });
      setQuickLayer(next.get("quick") ?? "");
      const nextYear = Number.parseInt(next.get("year") ?? "", 10);
      if (Number.isFinite(nextYear) && nextYear >= timeRange.min && nextYear <= timeRange.max) setTimelineYear(nextYear);
      const groups = next.get("layers")?.split(",");
      if (groups) setLayerGroups(Object.fromEntries(Object.keys(defaultLayerGroups).map((key) => [key, groups.includes(key)])) as AtlasLayerGroupState);
      const lines = next.get("lines")?.split(",");
      if (lines) setVisibleTransitLines(lines.filter((code) => code in TRANSIT_LINE_COLORS));
      const modes = next.get("modes")?.split(",").filter((mode): mode is TransitMode => TRANSIT_MODE_ORDER.includes(mode as TransitMode));
      if (modes) setVisibleTransitModes(modes);
      const references = next.get("reference")?.split(",") ?? [];
      if (next.has("reference")) { setShowRoadNetwork(references.includes("roads")); setShowRailNetwork(references.includes("rail")); setShowDisusedRail(references.includes("disused")); }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // Mount-only by design: this reads the URL once and then listens for back/forward. Re-running it on
    // every range change would re-apply saved settings over the user's current choices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!preferencesHydrated.current) return;
    if (!researcherMode) {
      const url = new URL(window.location.href);
      ["type", "sector", "status", "mapped", "quick", "layers", "modes", "lines", "reference"].forEach((key) => url.searchParams.delete(key));
      window.history.replaceState({}, "", url);
      return;
    }
    try { window.localStorage.setItem("gca-map-state", JSON.stringify({ filters, quickLayer, layerGroups, showRoadNetwork, showRailNetwork, showDisusedRail, visibleTransitModes, visibleTransitLines, showInterchanges })); } catch { /* Map preferences are optional. */ }
    const url = new URL(window.location.href);
    const setParam = (key: string, value: string) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    setParam("type", filters.type); setParam("sector", filters.sector); setParam("status", filters.status);
    setParam("mapped", filters.mappedOnly ? "true" : ""); setParam("quick", quickLayer);
    setParam("layers", Object.entries(layerGroups).filter(([, enabled]) => enabled).map(([key]) => key).join(","));
    setParam("modes", visibleTransitModes.join(","));
    setParam("lines", visibleTransitLines.join(","));
    setParam("reference", [showRoadNetwork ? "roads" : "", showRailNetwork ? "rail" : "", showDisusedRail ? "disused" : ""].filter(Boolean).join(","));
    // BATCH 14.1 — only when it differs from today, so a normal URL stays clean and still means "now".
    setParam("year", timelineEnabled && timelineYear !== timeRange.max ? String(timelineYear) : "");
    window.history.replaceState({}, "", url);
  }, [researcherMode, filters, quickLayer, layerGroups, showRoadNetwork, showRailNetwork, showDisusedRail, visibleTransitModes, visibleTransitLines, showInterchanges, timelineEnabled, timelineYear, timeRange]);

  useEffect(() => {
    if (previousResearcherMode.current === null) { previousResearcherMode.current = researcherMode; return; }
    if (previousResearcherMode.current && !researcherMode) {
      setFilters(emptyFilters); setQuickLayer(""); setTimelineEnabled(false); setTimelineYear(timeRange.max); setServiceRadiusMeters(0);
      setLayerGroups(defaultLayerGroups); setShowRoadNetwork(true); setShowRailNetwork(false); setShowDisusedRail(false);
      setVisibleTransitModes([...TRANSIT_MODE_ORDER]); setVisibleTransitLines(Object.keys(TRANSIT_LINE_COLORS)); setShowInterchanges(true);
    }
    previousResearcherMode.current = researcherMode;
  }, [researcherMode, timeRange]);

  useEffect(() => {
    const controller = new AbortController();
    setEntitiesLoading(true);
    setEntitiesError(null);
    const params = new URLSearchParams({ limit: "500" });
    if (filters.type) params.set("type", filters.type);
    if (filters.sector) params.set("sector", filters.sector);
    if (filters.status) params.set("status", filters.status);
    if (filters.mappedOnly) params.set("has_geometry", "true");
    fetch(`/api/atlas/entities?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error?.message ?? `HTTP ${response.status}`);
        return response.json() as Promise<EntityListResponse>;
      })
      .then((payload) => setEntities(payload.entities))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setEntitiesError(messageFrom(error, language)); })
      .finally(() => setEntitiesLoading(false));
    return () => controller.abort();
  }, [filters.type, filters.sector, filters.status, filters.mappedOnly, language]);

  useEffect(() => {
    if (!showAdminBoundaries) { setAdminUnitFeatures([]); return; }
    const controller = new AbortController();
    const levels: Array<"2" | "3"> = researcherMode ? ["2", "3"] : ["2"];
    Promise.all(levels.map(async (level) => {
      const response = await fetch(`/api/atlas/features?type=admin_unit&level=${level}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as AtlasFeatureCollection;
      return payload.features;
    })).then((collections) => setAdminUnitFeatures(collections.flat()))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setFeaturesError(messageFrom(error, language)); });
    return () => controller.abort();
  }, [showAdminBoundaries, researcherMode, language]);

  useEffect(() => {
    const controller = new AbortController();
    setFeaturesLoading(true);
    setFeaturesError(null);
    const params = new URLSearchParams({ zoom: String(Math.max(4, Math.min(20, zoom))) });
    if (filters.type) params.set("type", filters.type);
    if (filters.sector) params.set("sector", filters.sector);
    // A status filter + a year would fight each other (filter by "operational" while the year says
    // "planned"), so the year takes over when it is on.
    if (filters.status && !timelineEnabled) params.set("status", filters.status);
    fetch(`/api/atlas/features?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error?.message ?? `HTTP ${response.status}`);
        return response.json() as Promise<AtlasFeatureCollection>;
      })
      .then(setFeatures)
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setFeaturesError(messageFrom(error, language)); })
      .finally(() => setFeaturesLoading(false));
    return () => controller.abort();
  }, [filters.type, filters.sector, filters.status, zoom, language, timelineEnabled]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/rail-network-status.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ available?: boolean }>;
      })
      .then((status) => setRailNetworkAvailable(status.available === true))
      .catch(() => setRailNetworkAvailable(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setStatsError(null);
    fetch("/api/atlas/stats", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as AtlasStatsResponse;
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
        return payload;
      })
      .then(setStats)
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setStatsError(messageFrom(error, language)); });
    return () => controller.abort();
  }, [language]);

  /**
   * FIX E — a selected city/district highlights its whole area automatically. The drawable boundary
   * (official CAPMAS first, OSM second) is fetched once the entity detail says one exists; entities
   * without a boundary keep the point behaviour and no request is made.
   */
  useEffect(() => {
    if (!selectedCode || !detail || detail.code !== selectedCode || !detail.has_boundary) return;
    if (highlightBoundary?.properties.entity_code === selectedCode) return;
    if (boundaryDismissedCode === selectedCode) return;
    const controller = new AbortController();
    let cancelled = false;
    setBoundaryLoadingCode(selectedCode);
    setBoundaryError(null);
    fetch(`/api/atlas/entities/${encodeURIComponent(selectedCode)}/boundary`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { features?: AreaBoundaryFeature[]; feature?: AreaBoundaryFeature; error?: { message?: string } };
        const feature = payload.feature ?? payload.features?.find((item) => item.properties.entity_code === selectedCode);
        if (!response.ok || !feature) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
        return feature;
      })
      .then((feature) => { if (!cancelled) setHighlightBoundary(feature); })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        // A missing boundary is not an error for the simple view: the point stays selected.
        setBoundaryError(null);
      })
      .finally(() => { if (!cancelled) setBoundaryLoadingCode(null); });
    return () => { cancelled = true; controller.abort(); };
  }, [selectedCode, detail, highlightBoundary?.properties.entity_code, boundaryDismissedCode]);

  useEffect(() => {
    if (!selectedCode) { setDetail(null); setDetailError(null); setDetailLoading(false); return; }
    const controller = new AbortController();
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    fetch(`/api/atlas/entities/${encodeURIComponent(selectedCode)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error?.message ?? `HTTP ${response.status}`);
        return response.json() as Promise<AtlasEntityDetail>;
      })
      .then(setDetail)
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setDetailError(messageFrom(error, language)); })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selectedCode, language]);

  const selectEntity = useCallback((code: string) => {
    setSelectedCode(code);
    setServiceRadiusMeters(0);
    setHighlightBoundary(null);
    setBoundaryError(null);
    setBoundaryDismissedCode(null);
    setFitRequest((value) => value + 1);
    const url = new URL(window.location.href);
    url.searchParams.set("entity", code);
    window.history.pushState({}, "", url);
  }, []);
  const selectRelatedEntity = useCallback((code: string) => {
    setFilters(emptyFilters);
    setQuickLayer("");
    setLayerGroups(defaultLayerGroups);
    setVisibleTransitModes([...TRANSIT_MODE_ORDER]);
    setVisibleTransitLines(Object.keys(TRANSIT_LINE_COLORS));
    selectEntity(code);
  }, [selectEntity]);
  const toggleAreaBoundary = useCallback(async (code: string) => {
    if (highlightBoundary?.properties.entity_code === code) {
      setHighlightBoundary(null);
      setBoundaryError(null);
      setBoundaryDismissedCode(code);
      return;
    }
    setBoundaryDismissedCode(null);
    setBoundaryLoadingCode(code);
    setBoundaryError(null);
    try {
      const response = await fetch(`/api/atlas/entities/${encodeURIComponent(code)}/boundary`);
      const payload = await response.json() as { features?: AreaBoundaryFeature[]; feature?: AreaBoundaryFeature; error?: { message?: string } };
      const feature = payload.feature ?? payload.features?.find((item) => item.properties.entity_code === code);
      if (!response.ok || !feature) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      setHighlightBoundary(feature);
    } catch (error) {
      setBoundaryError(messageFrom(error, language));
    } finally {
      setBoundaryLoadingCode(null);
    }
  }, [highlightBoundary?.properties.entity_code, language]);
  /** «اعرض على الخريطة»: keep the panel open, refit the camera to the whole boundary/feature set. */
  const requestShowOnMap = useCallback(() => {
    if (!selectedCode) return;
    setFitRequest((value) => value + 1);
  }, [selectedCode]);
  const closeEntity = useCallback(() => {
    setSelectedCode(null);
    setDetail(null);
    setHighlightBoundary(null);
    setBoundaryError(null);
    setServiceRadiusMeters(0);
    const url = new URL(window.location.href);
    url.searchParams.delete("entity");
    window.history.pushState({}, "", url);
  }, []);

  useEffect(() => {
    if (!selectedCode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeEntity(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCode, closeEntity]);

  const geometryAlternatives = useMemo(() => findGeometryAlternatives(initialFeatures.features), [initialFeatures.features]);
  // BATCH 14.1 — the timeline is available to everyone, not only researchers: "what existed in 2019" is a
  // plain question. Researcher mode adds the deciding fact and evidence, not the control itself.
  const useTimeline = timelineEnabled;
  const timelineStatusByCode = useMemo(() => useTimeline ? resolveStatusByYear(statusTimeline, timelineYear) : null, [useTimeline, statusTimeline, timelineYear]);
  const timelineCounts = useMemo(() => timelineSummary(statusTimeline, timelineYear), [statusTimeline, timelineYear]);
  /**
   * How many entities drawn on the map the chosen year cannot speak about. Counted from the features
   * actually rendered, so the number describes this view rather than the whole database.
   */
  const timelineUndatedCount = useMemo(() => {
    if (!useTimeline) return 0;
    const codes = new Set<string>();
    for (const feature of features.features) {
      const code = feature.properties.entity_code;
      if (!timelineStatusByCode?.get(code)) codes.add(code);
    }
    return codes.size;
  }, [useTimeline, features, timelineStatusByCode]);
  const timelineWithheldCount = timelineCounts.entities_unreviewed;
  const regionalSet = useMemo(() => new Set(regionalCodes), [regionalCodes]);
  const visibleFeatureCollection = useMemo(() => {
    const visibleFeatures = features.features.flatMap((feature) => {
      const timelineStatus = useTimeline ? timelineStatusByCode?.get(feature.properties.entity_code) : undefined;
      const status = useTimeline ? timelineStatus?.status ?? "unknown" : feature.properties.status;
      if (!STATUSES.includes(status as (typeof STATUSES)[number])) return [];
      if (filters.status && status !== filters.status) return [];
      const featureType = feature.properties.type;
      if (selectedCode !== feature.properties.entity_code) {
        if (!layerGroups.infrastructure && ["road", "bridge", "interchange", "tunnel"].includes(featureType)) return [];
        if (!layerGroups.transport && ["transit_line", "transit_stop", "rail_station", "transit_station"].includes(featureType)) return [];
        if (!layerGroups.areas && ["city", "district", "neighborhood", "governorate"].includes(featureType)) return [];
        if (!layerGroups.projects && (featureType === "project" || ["under_construction", "planned", "approved_planned"].includes(status))) return [];
        if (quickLayer === "road" && featureType !== "road") return [];
        if (quickLayer === "transport" && !["transit_line", "transit_stop", "rail_station", "transit_station"].includes(featureType)) return [];
        if (quickLayer === "city" && !["city", "district", "neighborhood"].includes(featureType)) return [];
        // BATCH 12.2 — the «المدن» layer is a Greater Cairo layer: a regional link (Alexandria, Abu
        // Simbel, or anything whose geometry sits outside the region) must never appear in it, so it
        // cannot be mistaken for a city inside the atlas. It stays reachable by search and relations.
        if (quickLayer === "city" && regionalSet.has(feature.properties.entity_code)) return [];
        if (isTransitFeatureType(featureType)) {
          // FIX D: stations and lines share one mode/line filter, and an unresolved mode can never
          // make a station immune to it (the previous `modes.length &&` guard did exactly that).
          if (!transitFeatureVisible(feature.properties.entity_code, feature.properties.modes, visibleTransitModes, feature.properties.line_codes)) return [];
          if (!transitLineEnabled(feature.properties.entity_code, feature.properties.line_codes, visibleTransitLines)) return [];
        }
      }
      const alternatives = researcherMode ? geometryAlternatives.get(feature.properties.entity_code) : undefined;
      return [{ ...feature, properties: { ...feature.properties, status,
        ...(useTimeline ? { timeline_dated: timelineStatus?.dated ?? false, timeline_verification: timelineStatus?.verification_state ?? null, timeline_valid_as_of: timelineStatus?.valid_as_of ?? null } : {}),
        ...(alternatives ? { geometry_conflict: true, geometry_sources: alternatives.map((item) => item.source_label) } : {}) } }];
    });
    if (showAdminBoundaries) {
      visibleFeatures.push(...adminUnitFeatures.filter((feature) => feature.properties.level === 2 ||
        (feature.properties.level === 3 && researcherMode && zoom >= 13)));
    }
    const stationTypes = ["transit_stop", "rail_station", "transit_station"];
    const selectedStation = serviceRadiusMeters && researcherMode && stationTypes.includes(detail?.entity_type ?? "")
      ? features.features.find((feature) => feature.properties.entity_code === selectedCode && feature.geometry && typeof feature.geometry === "object" && "type" in feature.geometry && feature.geometry.type === "Point") : undefined;
    const coordinates = selectedStation?.geometry && typeof selectedStation.geometry === "object" && "coordinates" in selectedStation.geometry ? selectedStation.geometry.coordinates : null;
    if (selectedStation && Array.isArray(coordinates) && coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
      visibleFeatures.push({ type: "Feature", id: `SERVICE-AREA-${selectedCode}-${serviceRadiusMeters}`, geometry: approximateRadiusPolygon(coordinates[0], coordinates[1], serviceRadiusMeters),
        properties: { ...selectedStation.properties, code: `SERVICE-AREA-${selectedCode}-${serviceRadiusMeters}`, entity_code: selectedCode!, type: "service_area", status: "service_area", name_ar: `${serviceRadiusMeters} متر حول المحطة`, name_en: `${serviceRadiusMeters} m radius around station`, service_area: true, modes: [], line_codes: [], primary_line_code: null, interchange: false } });
    }
    return { ...features, features: visibleFeatures };
  }, [features, visibleTransitModes, visibleTransitLines, selectedCode, detail?.entity_type, layerGroups, quickLayer, filters.status, useTimeline, timelineStatusByCode, serviceRadiusMeters, researcherMode, geometryAlternatives, adminUnitFeatures, showAdminBoundaries, zoom, regionalSet]);
  const ar = language === "ar";
  /**
   * FIX F — the selected line's geometry completeness comes from the features actually drawn, so the
   * researcher note describes real data rather than a hard-coded claim.
   */
  const selectedGeometryCompleteness = useMemo(() => {
    if (!selectedCode) return null;
    const drawn = initialFeatures.features.filter((feature) => feature.properties.entity_code === selectedCode);
    const partial = drawn.find((feature) => (feature.properties as { geometry_completeness?: string }).geometry_completeness === "partial_source_geometry");
    return partial ? "partial_source_geometry" : null;
  }, [initialFeatures, selectedCode]);

  const totalFeatures = visibleFeatureCollection.features.length;
  const mapTransitModes = !filters.type || ["transit_line", "transit_stop", "rail_station", "transit_station"].includes(filters.type)
    ? visibleTransitModes
    : [];
  const exportParams = new URLSearchParams();
  const exportType = filters.type || quickLayer;
  if (exportType) exportParams.set("type", exportType);
  if (filters.sector) exportParams.set("sector", filters.sector);
  if (filters.status) exportParams.set("status", filters.status);
  if (timelineEnabled) exportParams.set("year", String(timelineYear));
  const filteredExportUrl = `/api/exports/geopackage?${exportParams.toString()}`;

  return <main className={`atlas-shell theme-${theme}`} data-theme={theme} dir={ar ? "rtl" : "ltr"} id="main-content">
    <a className="skip-link" href="#main-content">{ar ? "تجاوز إلى المحتوى" : "Skip to content"}</a>
    <ResearcherOnly><AppSidebar entities={entities} loading={entitiesLoading} selectedCode={selectedCode} onSelect={selectEntity} language={language} regionalCodes={regionalCodes} /></ResearcherOnly>
    <section className="atlas-workspace">
      <header className="atlas-topbar">
        <div className="topbar-heading"><span className="eyebrow">{ar ? "مصر · دلتا النيل" : "EGYPT · NILE DELTA"}</span><strong>{ar ? "الخريطة التفاعلية" : "Interactive map"}</strong></div>
        <SearchCommand language={language} onSelect={selectEntity} onShowBoundary={toggleAreaBoundary} />
        <ResearcherOnly><nav className="atlas-info-nav" aria-label={ar ? "روابط الباحث" : "Research links"}><Link href={`/${language}/directory`}>{ar ? "الدليل" : "Directory"}</Link><Link href={`/${language}/data`}>{ar ? "البيانات" : "Data"}</Link><Link href={`/${language}/methodology`}>{ar ? "المنهجية" : "Methodology"}</Link><Link href={`/${language}/sources`}>{ar ? "المصادر" : "Sources"}</Link><Link href={`/${language}/api-docs`}>{ar ? "توثيق API" : "API docs"}</Link></nav></ResearcherOnly>
        <div className="topbar-actions"><ResearchModeToggle language={language} compact/><FirstVisitGuide language={language}/><ThemeToggle theme={theme} onChange={setTheme} language={language} /><SiteLanguageSwitch language={language} label={ar ? "English" : "العربية"} /></div>
      </header>
      <ResearcherOnly><section className="stats-strip" aria-label={ar ? "إحصاءات قاعدة البيانات" : "Database statistics"} aria-live="polite">
        <div className="stats-label"><Database aria-hidden="true" /><span>{ar ? "سجل الأطلس" : "Atlas records"}</span></div>
        {stats?.counts ? <>
          <Stat label={ar ? "كيان" : "Entities"} value={stats.counts.entities} />
          <Stat label={ar ? "حقيقة" : "Facts"} value={stats.counts.facts} />
          <Stat label={ar ? "مصدر" : "Sources"} value={stats.counts.evidence} />
          <Stat label={ar ? "هندسة" : "Geometries"} value={stats.counts.features} />
        </> : <span className={`stats-unavailable ${statsError ? "has-error" : ""}`}>{statsError ? (ar ? "تعذّر تحميل الإحصاءات" : "Stats unavailable") : (ar ? "جارٍ تحميل الإحصاءات…" : "Loading statistics…")}</span>}
        {statsError && <span className="stats-retry"><AlertTriangle aria-hidden="true" />{statsError}</span>}
      </section></ResearcherOnly>
      <section className="map-stage" aria-label={ar ? "مساحة الخريطة" : "Map workspace"}>
        <MapView key={mapGeneration} theme={theme} features={visibleFeatureCollection} onSelect={selectEntity} onSelectAdminUnit={setSelectedAdminUnit} onZoomChange={setZoom} onStyleStatus={setMapStyleStatus} language={language} selectedCode={selectedCode} showRoadNetwork={showRoadNetwork} showRailNetwork={showRailNetwork && railNetworkAvailable} showDisusedRail={showDisusedRail} showAreaBoundaries={layerGroups.areas} highlightBoundary={highlightBoundary} visibleTransitModes={mapTransitModes} showInterchanges={showInterchanges} fitRequest={fitRequest} />
        {selectedAdminUnit && <aside className="admin-unit-map-card" dir={ar ? "rtl" : "ltr"} aria-label={ar ? "تفاصيل الوحدة الإدارية" : "Administrative unit details"}>
          <button type="button" aria-label={ar ? "إغلاق" : "Close"} onClick={() => setSelectedAdminUnit(null)}>×</button>
          <strong>{ar ? selectedAdminUnit.properties.name_ar : selectedAdminUnit.properties.name_en || selectedAdminUnit.properties.name_ar}</strong>
          <span>{ar ? (selectedAdminUnit.properties.level === 2 ? "قسم / وحدة إدارية" : "شياخة") : (selectedAdminUnit.properties.level === 2 ? "Qism / administrative unit" : "Shiakha")}</span>
          <span>{ar ? `يتبع ${selectedAdminUnit.properties.parent_name_ar ?? ""}` : `Within ${selectedAdminUnit.properties.parent_name_ar ?? ""}`}</span>
          <span>{Number(selectedAdminUnit.properties.area_sqkm ?? 0).toLocaleString(language, { maximumFractionDigits: 2 })} km²</span>
          <small>{selectedAdminUnit.properties.source}</small>
        </aside>}
        <div className="map-header-card"><div className="map-title-icon"><MapPinned aria-hidden="true" /></div><div><span>{ar ? "القاهرة الكبرى" : "Greater Cairo"}</span><h1>{ar ? "خريطة القاهرة الكبرى" : "Greater Cairo map"}</h1><ResearcherOnly><p>{ar ? "المصادر المختلفة تبقى ظاهرة؛ لا تخمين للهندسة أو الحالة." : "Conflicting sources remain visible. No inferred geometry or status."}</p></ResearcherOnly></div></div>
        <div className="map-toolbar"><LayerChips type={quickLayer} onTypeChange={setQuickLayer} language={language} />
          {!researcherMode && <div className="simple-map-status-key" aria-label={ar ? "دليل ألوان الحالة" : "Status colour key"}><span><i className="map-key-dot is-operational"/>✓ {ar ? "يعمل" : "Operating"}</span><span><i className="map-key-dot is-partial"/>◐ {ar ? "يعمل جزئيًا" : "Partly operating"}</span><span><i className="map-key-dot is-building"/>⚒ {ar ? "تحت الإنشاء" : "Building"}</span><span><i className="map-key-dot is-planned"/>◷ {ar ? "مخطط" : "Planned"}</span></div>}
          <label className="admin-boundary-toggle"><input type="checkbox" checked={showAdminBoundaries} onChange={(event) => { setShowAdminBoundaries(event.target.checked); setSelectedAdminUnit(null); }} /><span>{ar ? "الأحياء والأقسام" : "Districts & qisms"}</span></label>
          {/* BATCH 14.1 — one small button for everyone; the slider only appears when asked for. */}
          <TimeControl language={language} year={timelineYear} minYear={timeRange.min} maxYear={timeRange.max}
            enabled={timelineEnabled} onToggle={setTimelineEnabled}
            onChange={setTimelineYear} undatedCount={timelineUndatedCount} withheldCount={timelineWithheldCount} />
          <ResearcherOnly>
          <nav className="map-export-links" aria-label={ar ? "تصدير مرشحات الخريطة" : "Export map filters"}><a href={filteredExportUrl}>GeoPackage</a><a href={`/api/exports/geojson?${exportParams.toString()}`}>GeoJSON</a></nav>
          <ActiveFilterChips filters={filters} quickLayer={quickLayer} language={language} onClearQuick={() => setQuickLayer("")} onClearFilter={(key) => setFilters((current) => ({ ...current, [key]: key === "mappedOnly" ? false : "" }))} onClearAll={() => { setQuickLayer(""); setFilters(emptyFilters); setLayerGroups(defaultLayerGroups); }} />
          <details className="layers-panel"><summary>{ar ? "الطبقات" : "Layers"}</summary>
          <LayerGroupToggles enabled={layerGroups} language={language} onChange={(group: AtlasLayerGroup, enabled: boolean) => { setLayerGroups((current) => ({ ...current, [group]: enabled })); if (group === "reference") { setShowRoadNetwork(enabled); setShowRailNetwork(enabled); } }} />
          <MapFilters filters={filters} onChange={setFilters} language={language} />
          <label className="road-network-toggle"><input type="checkbox" checked={showRoadNetwork} onChange={(event) => setShowRoadNetwork(event.target.checked)} /><span>{ar ? "شبكة الطرق (OpenStreetMap)" : "Road network (OSM)"}</span></label>
          <label className={`road-network-toggle rail-network-toggle ${!railNetworkAvailable ? "is-unavailable" : ""}`} title={!railNetworkAvailable ? (ar ? "ملف استخراج السكك لم يُرفق بعد" : "Rail extract has not been attached yet") : undefined}>
            <input type="checkbox" checked={showRailNetwork} disabled={!railNetworkAvailable} onChange={(event) => setShowRailNetwork(event.target.checked)} />
            <span>{railNetworkAvailable ? (ar ? "شبكة السكك الحديدية (OpenStreetMap)" : "Rail network (OpenStreetMap)") : (ar ? "شبكة السكك الحديدية — بانتظار ملف OSM" : "Rail network — awaiting OSM extract")}{railNetworkAvailable && <small className="rail-network-attribution">© OpenStreetMap contributors · ODbL 1.0</small>}</span>
          </label>
          {railNetworkAvailable && <label className="road-network-toggle rail-network-toggle"><input type="checkbox" checked={showDisusedRail} disabled={!showRailNetwork} onChange={(event) => setShowDisusedRail(event.target.checked)} /><span>{ar ? "إظهار المسارات المهجورة والمحافظة عليها" : "Show disused and preserved tracks"}</span></label>}
          <details className="transit-mode-details">
            <summary>{ar ? "وسائل النقل والفلترة" : "Transit modes & filter"}</summary>
            <TransitModeFilter visibleModes={visibleTransitModes}
              onChange={(mode, visible) => setVisibleTransitModes((current) => visible ? [...new Set([...current, mode])] : current.filter((item) => item !== mode))}
              showInterchanges={showInterchanges} onInterchangesChange={setShowInterchanges} language={language} />
          </details>
          <TransitLineToggles visibleLines={visibleTransitLines} onChange={(code, visible) => setVisibleTransitLines((current) => visible ? [...new Set([...current, code])] : current.filter((item) => item !== code))} language={language} />
          <fieldset className="service-area-control"><legend>{ar ? "نطاق مسافة حول محطة" : "Distance radius around a station"}</legend>
            {detail && ["transit_stop", "rail_station", "transit_station"].includes(detail.entity_type) ? <div className="service-area-options">
              <button type="button" aria-pressed={serviceRadiusMeters === 500} onClick={() => setServiceRadiusMeters(serviceRadiusMeters === 500 ? 0 : 500)}>{ar ? "٥٠٠ متر" : "500 m"}</button>
              <button type="button" aria-pressed={serviceRadiusMeters === 1000} onClick={() => setServiceRadiusMeters(serviceRadiusMeters === 1000 ? 0 : 1000)}>{ar ? "١ كم" : "1 km"}</button>
              {serviceRadiusMeters > 0 && <button type="button" className="quiet-button" onClick={() => setServiceRadiusMeters(0)}>{ar ? "إخفاء" : "Hide"}</button>}
            </div> : <p>{ar ? "اختر محطة أولًا من الخريطة أو البحث." : "Choose a station from the map or search first."}</p>}
            <small>{ar ? "دائرة مسافة تقريبية، وليست نطاق تغطية أو زمن وصول." : "Approximate distance radius only, not a catchment or travel-time area."}</small>
          </fieldset>
          <Legend language={language} boundaryActive={Boolean(highlightBoundary)} boundaryLabel={language === "ar"
            ? highlightBoundary?.properties.properties.display_label_ar
            : highlightBoundary?.properties.properties.display_label_en} />
          </details>
          <span className="map-feature-count" aria-live="polite">{featuresLoading ? "…" : totalFeatures} {ar ? "ميزة هندسية" : "features"}</span></ResearcherOnly>
        </div>
        {((featuresLoading && features.features.length === 0) || (entitiesLoading && entities.length === 0)) && <div className="map-loading" role="status"><RefreshCw aria-hidden="true" />{ar ? "جارٍ تحميل بيانات الأطلس…" : "Loading atlas data…"}</div>}
        {(featuresError || entitiesError || boundaryError) && <div className="map-error" role="alert"><AlertTriangle aria-hidden="true" /><span>{boundaryError ?? featuresError ?? entitiesError}</span></div>}
        {mapStyleStatus === "error" && <div className="map-error map-style-error" role="alert"><AlertTriangle aria-hidden="true" /><span>{ar ? "تعذّر تحميل خريطة OpenFreeMap." : "Could not load the OpenFreeMap basemap."}</span><button type="button" onClick={() => { setMapStyleStatus("loading"); setMapGeneration((value) => value + 1); }}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
        {!featuresLoading && !featuresError && totalFeatures === 0 && <div className="map-empty">{ar ? "لا توجد هندسة تطابق هذه الفلاتر. الكيانات تظل متاحة في القائمة والبحث." : "No geometries match these filters. Entities remain available in the list and search."}</div>}
        {researcherMode && serviceRadiusMeters > 0 && <div className="service-area-map-label" role="status">{ar ? `نصف قطر تقريبي ${serviceRadiusMeters} م · ليس نطاق تغطية فعليًا` : `Approximate ${serviceRadiusMeters} m radius · not an actual catchment`}</div>}
        <div className="map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors, ODbL 1.0</a><span>·</span><span>© CAPMAS (الجهاز المركزي للتعبئة العامة والإحصاء) عبر OCHA/HDX، CC BY-IGO</span><span>·</span><a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a></div>
        <nav className="atlas-site-footer" aria-label={ar ? "إسناد بيانات الأطلس" : "Atlas data attribution"}><span>{ar ? "حقائق البحث والأدلة: © Mustafa Aboalazm (مصطفى أبوالعزم)، CC BY 4.0 | حدود CAPMAS عبر OCHA/HDX، CC BY-IGO | هندسة OpenStreetMap، ODbL 1.0" : "Research facts and evidence: © Mustafa Aboalazm (مصطفى أبوالعزم), CC BY 4.0 | CAPMAS boundaries via OCHA/HDX, CC BY-IGO | OpenStreetMap geometry, ODbL 1.0"}</span></nav>
        <ResearcherOnly><nav className="atlas-site-footer atlas-research-footer" aria-label={ar ? "روابط الباحث" : "Research links"}><Link href={`/${language}/directory`}>{ar ? "الدليل" : "Directory"}</Link><Link href={`/${language}/data`}>{ar ? "البيانات" : "Data"}</Link><Link href={`/${language}/methodology`}>{ar ? "المنهجية" : "Methodology"}</Link><Link href={`/${language}/sources`}>{ar ? "المصادر" : "Sources"}</Link><Link href={`/${language}/api-docs`}>{ar ? "توثيق API" : "API docs"}</Link></nav></ResearcherOnly>
      </section>
    </section>
    {selectedCode && <EntityPanel entity={detail} loading={detailLoading} error={detailError} onClose={closeEntity} onShowOnMap={requestShowOnMap} language={language}
      geometryCompleteness={selectedGeometryCompleteness}
      onToggleBoundary={toggleAreaBoundary} boundaryActive={highlightBoundary?.properties.entity_code === detail?.code}
      boundaryLoading={boundaryLoadingCode === detail?.code} onSelectRelated={selectRelatedEntity} geometryAlternatives={selectedCode ? geometryAlternatives.get(selectedCode) ?? [] : []}
      timeline={useTimeline && detail ? { year: timelineYear, resolution: timelineStatusByCode?.get(detail.code) ?? null } : undefined} />}
  </main>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat-item"><strong>{value.toLocaleString()}</strong><span>{label}</span></div>;
}
