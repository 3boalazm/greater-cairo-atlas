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
import { TRANSIT_MODE_ORDER, TRANSIT_LINE_COLORS, transitModesForEntityCode, type TransitMode } from "@/lib/atlas/transit-modes";
import type { AreaBoundaryFeature } from "@/lib/atlas/area-boundaries";

const MapView = dynamic(
  () => import("./MapView").then((module) => module.MapView),
  { ssr: false, loading: () => <div className="map-canvas map-canvas-loading" role="status">Loading interactive map…</div> },
);
import { LanguageToggle, ThemeToggle, useAtlasPreferences } from "./Preferences";
import { SearchCommand } from "./SearchCommand";
import type { AtlasEntityDetail, AtlasEntitySummary, AtlasFeatureCollection, AtlasStatsResponse, EntityListResponse } from "./atlas-client";
import { STATUSES } from "./atlas-client";

const emptyFilters: AtlasFilters = { type: "", sector: "", status: "", mappedOnly: false };
const defaultLayerGroups: AtlasLayerGroupState = { infrastructure: true, transport: true, areas: true, projects: true, reference: true };

function messageFrom(error: unknown, language: "ar" | "en") {
  return error instanceof Error ? error.message : language === "ar" ? "تعذر الاتصال بالخدمة." : "Could not connect to the service.";
}

export default function AtlasApp({ initialEntities, initialFeatures, initialStats, initialLanguage, regionalCodes }: {
  initialEntities: AtlasEntitySummary[];
  initialFeatures: AtlasFeatureCollection;
  initialStats: AtlasStatsResponse;
  initialLanguage: "ar" | "en";
  regionalCodes: string[];
}) {
  const { theme, setTheme, language, setLanguage } = useAtlasPreferences(initialLanguage);
  const [filters, setFilters] = useState<AtlasFilters>(emptyFilters);
  const [quickLayer, setQuickLayer] = useState("");
  const [layerGroups, setLayerGroups] = useState<AtlasLayerGroupState>(defaultLayerGroups);
  const [entities, setEntities] = useState<AtlasEntitySummary[]>(initialEntities);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entitiesError, setEntitiesError] = useState<string | null>(null);
  const [features, setFeatures] = useState<AtlasFeatureCollection>(initialFeatures);
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
  const [boundaryLoadingCode, setBoundaryLoadingCode] = useState<string | null>(null);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const preferencesHydrated = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("entity");
    if (fromUrl) setSelectedCode(fromUrl);
    const hasUrlState = ["type", "sector", "status", "mapped", "quick", "layers"].some((key) => params.has(key));
    let saved: { filters?: AtlasFilters; quickLayer?: string; layerGroups?: AtlasLayerGroupState; visibleTransitModes?: TransitMode[]; visibleTransitLines?: string[]; showRoadNetwork?: boolean; showRailNetwork?: boolean; showDisusedRail?: boolean; showInterchanges?: boolean } = {};
    if (!hasUrlState) {
      try { saved = JSON.parse(window.localStorage.getItem("gca-map-state") ?? "{}"); } catch { saved = {}; }
    }
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
    preferencesHydrated.current = true;
    const onPopState = () => {
      const next = new URLSearchParams(window.location.search);
      setSelectedCode(next.get("entity"));
      setFilters({ type: next.get("type") ?? "", sector: next.get("sector") ?? "", status: next.get("status") ?? "", mappedOnly: next.get("mapped") === "true" });
      setQuickLayer(next.get("quick") ?? "");
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
  }, []);

  useEffect(() => {
    if (!preferencesHydrated.current) return;
    try { window.localStorage.setItem("gca-map-state", JSON.stringify({ filters, quickLayer, layerGroups, showRoadNetwork, showRailNetwork, showDisusedRail, visibleTransitModes, visibleTransitLines, showInterchanges })); } catch { /* Map preferences are optional. */ }
    const url = new URL(window.location.href);
    const setParam = (key: string, value: string) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    setParam("type", filters.type); setParam("sector", filters.sector); setParam("status", filters.status);
    setParam("mapped", filters.mappedOnly ? "true" : ""); setParam("quick", quickLayer);
    setParam("layers", Object.entries(layerGroups).filter(([, enabled]) => enabled).map(([key]) => key).join(","));
    setParam("modes", visibleTransitModes.join(","));
    setParam("lines", visibleTransitLines.join(","));
    setParam("reference", [showRoadNetwork ? "roads" : "", showRailNetwork ? "rail" : "", showDisusedRail ? "disused" : ""].filter(Boolean).join(","));
    window.history.replaceState({}, "", url);
  }, [filters, quickLayer, layerGroups, showRoadNetwork, showRailNetwork, showDisusedRail, visibleTransitModes, visibleTransitLines, showInterchanges]);

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
    const controller = new AbortController();
    setFeaturesLoading(true);
    setFeaturesError(null);
    const params = new URLSearchParams({ zoom: String(Math.max(4, Math.min(20, zoom))) });
    if (filters.type) params.set("type", filters.type);
    if (filters.sector) params.set("sector", filters.sector);
    if (filters.status) params.set("status", filters.status);
    fetch(`/api/atlas/features?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error?.message ?? `HTTP ${response.status}`);
        return response.json() as Promise<AtlasFeatureCollection>;
      })
      .then(setFeatures)
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setFeaturesError(messageFrom(error, language)); })
      .finally(() => setFeaturesLoading(false));
    return () => controller.abort();
  }, [filters.type, filters.sector, filters.status, zoom, language]);

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
    setHighlightBoundary(null);
    setBoundaryError(null);
    const url = new URL(window.location.href);
    url.searchParams.set("entity", code);
    window.history.pushState({}, "", url);
  }, []);
  const toggleAreaBoundary = useCallback(async (code: string) => {
    if (highlightBoundary?.properties.entity_code === code) {
      setHighlightBoundary(null);
      setBoundaryError(null);
      return;
    }
    selectEntity(code);
    setHighlightBoundary(null);
    setBoundaryError(null);
    setBoundaryLoadingCode(code);
    try {
      const response = await fetch(`/api/atlas/entities/${encodeURIComponent(code)}/boundary`);
      const payload = await response.json() as { features?: AreaBoundaryFeature[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      const boundary = payload.features?.find((feature) => feature.properties.entity_code === code);
      if (!boundary) throw new Error(language === "ar" ? "الحدود غير متاحة في المصدر." : "No source boundary is available.");
      setHighlightBoundary(boundary);
    } catch (error) {
      setBoundaryError(messageFrom(error, language));
    } finally {
      setBoundaryLoadingCode(null);
    }
  }, [highlightBoundary, language, selectEntity]);
  const closeEntity = useCallback(() => {
    setSelectedCode(null);
    setHighlightBoundary(null);
    setBoundaryError(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("entity");
    window.history.pushState({}, "", url);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".map-canvas")?.focus());
  }, []);

  useEffect(() => {
    if (!selectedCode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeEntity(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCode, closeEntity]);

  const visibleFeatureCollection = useMemo(() => ({
    ...features,
    features: features.features.filter((feature) => {
      if (!STATUSES.includes(feature.properties.status as (typeof STATUSES)[number])) return false;
      const featureType = feature.properties.type;
      if (selectedCode === feature.properties.entity_code) return true;
      if (!layerGroups.infrastructure && ["road", "bridge", "interchange", "tunnel"].includes(featureType)) return false;
      if (!layerGroups.transport && ["transit_line", "transit_stop", "rail_station"].includes(featureType)) return false;
      if (!layerGroups.areas && ["city", "district", "neighborhood", "governorate"].includes(featureType)) return false;
      if (!layerGroups.projects && (featureType === "project" || ["under_construction", "planned", "approved_planned"].includes(feature.properties.status))) return false;
      if (quickLayer === "road" && featureType !== "road") return false;
      if (quickLayer === "transport" && !["transit_line", "transit_stop", "rail_station"].includes(featureType)) return false;
      if (quickLayer === "city" && !["city", "district", "neighborhood"].includes(featureType)) return false;
      if (featureType === "transit_line" || featureType === "transit_stop" || featureType === "rail_station") {
        const modes = feature.properties.modes?.length ? feature.properties.modes : transitModesForEntityCode(feature.properties.entity_code);
        if (modes.length && !modes.some((mode) => visibleTransitModes.includes(mode as TransitMode))) return false;
        const lineCodes = feature.properties.line_codes?.length ? feature.properties.line_codes : feature.properties.entity_code.startsWith("TRANSIT-") ? [feature.properties.entity_code] : [];
        if (lineCodes.length && !lineCodes.some((line) => visibleTransitLines.includes(line))) return false;
      }
      return true;
    }),
  }), [features, visibleTransitModes, visibleTransitLines, selectedCode, layerGroups, quickLayer]);
  const ar = language === "ar";
  const totalFeatures = features.features.length;
  const mapTransitModes = !filters.type || ["transit_line", "transit_stop", "rail_station", "transit_station"].includes(filters.type)
    ? visibleTransitModes
    : [];

  return <main className={`atlas-shell theme-${theme}`} data-theme={theme} dir={ar ? "rtl" : "ltr"} id="main-content">
    <a className="skip-link" href="#main-content">{ar ? "تجاوز إلى المحتوى" : "Skip to content"}</a>
    <AppSidebar entities={entities} loading={entitiesLoading} selectedCode={selectedCode} onSelect={selectEntity} language={language} regionalCodes={regionalCodes} />
    <section className="atlas-workspace">
      <header className="atlas-topbar">
        <div className="topbar-heading"><span className="eyebrow">{ar ? "مصر · دلتا النيل" : "EGYPT · NILE DELTA"}</span><strong>{ar ? "الخريطة التفاعلية" : "Interactive map"}</strong></div>
        <SearchCommand language={language} onSelect={selectEntity} onShowBoundary={toggleAreaBoundary} />
        <nav className="atlas-info-nav" aria-label={ar ? "روابط الأطلس" : "Atlas information links"}><Link href={`/directory?lang=${language}`}>{ar ? "الدليل" : "Directory"}</Link><Link href={`/data?lang=${language}`}>{ar ? "البيانات" : "Data"}</Link><Link href={`/methodology?lang=${language}`}>{ar ? "المنهجية" : "Methodology"}</Link><Link href={`/sources?lang=${language}`}>{ar ? "المصادر" : "Sources"}</Link></nav>
        <div className="topbar-actions"><ThemeToggle theme={theme} onChange={setTheme} language={language} /><LanguageToggle language={language} onChange={setLanguage} /></div>
      </header>
      <section className="stats-strip" aria-label={ar ? "إحصاءات قاعدة البيانات" : "Database statistics"} aria-live="polite">
        <div className="stats-label"><Database aria-hidden="true" /><span>{ar ? "سجل الأطلس" : "Atlas records"}</span></div>
        {stats?.counts ? <>
          <Stat label={ar ? "كيان" : "Entities"} value={stats.counts.entities} />
          <Stat label={ar ? "حقيقة" : "Facts"} value={stats.counts.facts} />
          <Stat label={ar ? "مصدر" : "Sources"} value={stats.counts.evidence} />
          <Stat label={ar ? "هندسة" : "Geometries"} value={stats.counts.features} />
        </> : <span className={`stats-unavailable ${statsError ? "has-error" : ""}`}>{statsError ? (ar ? "تعذّر تحميل الإحصاءات" : "Stats unavailable") : (ar ? "جارٍ تحميل الإحصاءات…" : "Loading statistics…")}</span>}
        {statsError && <span className="stats-retry"><AlertTriangle aria-hidden="true" />{statsError}</span>}
      </section>
      <section className="map-stage" aria-label={ar ? "مساحة الخريطة" : "Map workspace"}>
        <MapView key={mapGeneration} theme={theme} features={visibleFeatureCollection} onSelect={selectEntity} onZoomChange={setZoom} onStyleStatus={setMapStyleStatus} language={language} selectedCode={selectedCode} showRoadNetwork={showRoadNetwork} showRailNetwork={showRailNetwork && railNetworkAvailable} showDisusedRail={showDisusedRail} showAreaBoundaries={layerGroups.areas} highlightBoundary={highlightBoundary} visibleTransitModes={mapTransitModes} showInterchanges={showInterchanges} />
        <div className="map-header-card"><div className="map-title-icon"><MapPinned aria-hidden="true" /></div><div><span>{ar ? "القاهرة الكبرى" : "Greater Cairo"}</span><h1>{ar ? "المكان كما توثّقه المصادر" : "Place, as documented"}</h1><p>{ar ? "الحقائق المتعارضة تبقى ظاهرة؛ لا تخمين للهندسة أو الحالة." : "Conflicting claims remain visible. No inferred geometry or status."}</p></div></div>
        <div className="map-toolbar"><LayerChips type={quickLayer} onTypeChange={setQuickLayer} language={language} />
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
          <Legend language={language} boundaryActive={Boolean(highlightBoundary)} boundaryLabel={language === "ar"
            ? highlightBoundary?.properties.properties.display_label_ar
            : highlightBoundary?.properties.properties.display_label_en} />
          </details>
          <span className="map-feature-count" aria-live="polite">{featuresLoading ? "…" : totalFeatures} {ar ? "ميزة هندسية" : "features"}</span>
        </div>
        {((featuresLoading && features.features.length === 0) || (entitiesLoading && entities.length === 0)) && <div className="map-loading" role="status"><RefreshCw aria-hidden="true" />{ar ? "جارٍ تحميل بيانات الأطلس…" : "Loading atlas data…"}</div>}
        {(featuresError || entitiesError || boundaryError) && <div className="map-error" role="alert"><AlertTriangle aria-hidden="true" /><span>{boundaryError ?? featuresError ?? entitiesError}</span></div>}
        {mapStyleStatus === "error" && <div className="map-error map-style-error" role="alert"><AlertTriangle aria-hidden="true" /><span>{ar ? "تعذّر تحميل خريطة OpenFreeMap." : "Could not load the OpenFreeMap basemap."}</span><button type="button" onClick={() => { setMapStyleStatus("loading"); setMapGeneration((value) => value + 1); }}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
        {!featuresLoading && !featuresError && totalFeatures === 0 && <div className="map-empty">{ar ? "لا توجد هندسة تطابق هذه الفلاتر. الكيانات تظل متاحة في القائمة والبحث." : "No geometries match these filters. Entities remain available in the list and search."}</div>}
        <div className="map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors, ODbL 1.0</a><span>·</span><a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a></div>
        <nav className="atlas-site-footer" aria-label={ar ? "روابط الأطلس وإسناد البيانات" : "Atlas links and data attribution"}><Link href={`/directory?lang=${language}`}>{ar ? "الدليل" : "Directory"}</Link><Link href={`/data?lang=${language}`}>{ar ? "البيانات" : "Data"}</Link><Link href={`/methodology?lang=${language}`}>{ar ? "المنهجية" : "Methodology"}</Link><Link href={`/sources?lang=${language}`}>{ar ? "المصادر" : "Sources"}</Link><span>{ar ? "حقائق البحث والأدلة وكل البيانات غير المشتقة من OSM: © Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0 | الهندسة المشتقة من OpenStreetMap: © OpenStreetMap contributors, ODbL 1.0" : "Research facts, evidence, and all data not derived from OpenStreetMap: © Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0 | OpenStreetMap-derived geometry: © OpenStreetMap contributors, ODbL 1.0"}</span></nav>
      </section>
    </section>
    {selectedCode && <EntityPanel entity={detail} loading={detailLoading} error={detailError} onClose={closeEntity} language={language}
      onToggleBoundary={toggleAreaBoundary} boundaryActive={highlightBoundary?.properties.entity_code === detail?.code}
      boundaryLoading={boundaryLoadingCode === detail?.code} />}
  </main>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat-item"><strong>{value.toLocaleString()}</strong><span>{label}</span></div>;
}
