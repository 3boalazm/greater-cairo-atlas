"use client";
/* eslint-disable react-hooks/set-state-in-effect -- fetch lifecycle and URL hydration synchronize external state. */

import { AlertTriangle, Database, MapPinned, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { AtlasFilters, LayerChips, Legend, MapFilters } from "./AtlasControls";
import { EntityPanel } from "./EntityPanel";
import { MapView, type MapStyleStatus } from "./MapView";
import { LanguageToggle, ThemeToggle, useAtlasPreferences } from "./Preferences";
import { SearchCommand } from "./SearchCommand";
import type { AtlasEntityDetail, AtlasEntitySummary, AtlasFeatureCollection, AtlasStatsResponse, EntityListResponse } from "./atlas-client";
import { STATUSES } from "./atlas-client";

const EMPTY_FEATURES: AtlasFeatureCollection = { type: "FeatureCollection", features: [] };
const emptyFilters: AtlasFilters = { type: "", sector: "", status: "" };

function messageFrom(error: unknown, language: "ar" | "en") {
  return error instanceof Error ? error.message : language === "ar" ? "تعذر الاتصال بالخدمة." : "Could not connect to the service.";
}

export default function AtlasApp() {
  const { theme, setTheme, language, setLanguage } = useAtlasPreferences();
  const [filters, setFilters] = useState<AtlasFilters>(emptyFilters);
  const [entities, setEntities] = useState<AtlasEntitySummary[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(true);
  const [entitiesError, setEntitiesError] = useState<string | null>(null);
  const [features, setFeatures] = useState<AtlasFeatureCollection>(EMPTY_FEATURES);
  const [featuresLoading, setFeaturesLoading] = useState(true);
  const [featuresError, setFeaturesError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(9);
  const [mapStyleStatus, setMapStyleStatus] = useState<MapStyleStatus>("loading");
  const [mapGeneration, setMapGeneration] = useState(0);
  const [stats, setStats] = useState<AtlasStatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<AtlasEntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("entity");
    if (fromUrl) setSelectedCode(fromUrl);
    const onPopState = () => setSelectedCode(new URLSearchParams(window.location.search).get("entity"));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setEntitiesLoading(true);
    setEntitiesError(null);
    const params = new URLSearchParams({ limit: "500" });
    if (filters.type) params.set("type", filters.type);
    if (filters.sector) params.set("sector", filters.sector);
    if (filters.status) params.set("status", filters.status);
    fetch(`/api/atlas/entities?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error?.message ?? `HTTP ${response.status}`);
        return response.json() as Promise<EntityListResponse>;
      })
      .then((payload) => setEntities(payload.entities))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setEntitiesError(messageFrom(error, language)); })
      .finally(() => setEntitiesLoading(false));
    return () => controller.abort();
  }, [filters.type, filters.sector, filters.status, language]);

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
    const url = new URL(window.location.href);
    url.searchParams.set("entity", code);
    window.history.pushState({}, "", url);
  }, []);
  const closeEntity = useCallback(() => {
    setSelectedCode(null);
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
    features: features.features.filter((feature) => STATUSES.includes(feature.properties.status as (typeof STATUSES)[number])),
  }), [features]);
  const ar = language === "ar";
  const totalFeatures = features.features.length;

  return <main className={`atlas-shell theme-${theme}`} data-theme={theme} dir={ar ? "rtl" : "ltr"}>
    <AppSidebar entities={entities} loading={entitiesLoading} selectedCode={selectedCode} onSelect={selectEntity} language={language} />
    <section className="atlas-workspace">
      <header className="atlas-topbar">
        <div className="topbar-heading"><span className="eyebrow">{ar ? "مصر · دلتا النيل" : "EGYPT · NILE DELTA"}</span><strong>{ar ? "الخريطة التفاعلية" : "Interactive map"}</strong></div>
        <SearchCommand language={language} onSelect={selectEntity} />
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
        <MapView key={mapGeneration} theme={theme} features={visibleFeatureCollection} onSelect={selectEntity} onZoomChange={setZoom} onStyleStatus={setMapStyleStatus} language={language} />
        <div className="map-header-card"><div className="map-title-icon"><MapPinned aria-hidden="true" /></div><div><span>{ar ? "القاهرة الكبرى" : "Greater Cairo"}</span><h1>{ar ? "المكان كما توثّقه المصادر" : "Place, as documented"}</h1><p>{ar ? "الحقائق المتعارضة تبقى ظاهرة؛ لا تخمين للهندسة أو الحالة." : "Conflicting claims remain visible. No inferred geometry or status."}</p></div></div>
        <div className="map-toolbar"><LayerChips type={filters.type} onTypeChange={(type) => setFilters((current) => ({ ...current, type }))} language={language} />
          <MapFilters filters={filters} onChange={setFilters} language={language} />
          <span className="map-feature-count" aria-live="polite">{featuresLoading ? "…" : totalFeatures} {ar ? "ميزة هندسية" : "features"}</span>
        </div>
        <Legend language={language} />
        {(featuresLoading || entitiesLoading) && <div className="map-loading" role="status"><RefreshCw aria-hidden="true" />{ar ? "جارٍ تحميل بيانات الأطلس…" : "Loading atlas data…"}</div>}
        {(featuresError || entitiesError) && <div className="map-error" role="alert"><AlertTriangle aria-hidden="true" /><span>{featuresError ?? entitiesError}</span></div>}
        {mapStyleStatus === "error" && <div className="map-error map-style-error" role="alert"><AlertTriangle aria-hidden="true" /><span>{ar ? "تعذّر تحميل خريطة OpenFreeMap." : "Could not load the OpenFreeMap basemap."}</span><button type="button" onClick={() => { setMapStyleStatus("loading"); setMapGeneration((value) => value + 1); }}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
        {!featuresLoading && !featuresError && totalFeatures === 0 && <div className="map-empty">{ar ? "لا توجد هندسة تطابق هذه الفلاتر. الكيانات تظل متاحة في القائمة والبحث." : "No geometries match these filters. Entities remain available in the list and search."}</div>}
        <div className="map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors, ODbL 1.0</a><span>·</span><a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a></div>
      </section>
    </section>
    {selectedCode && <EntityPanel entity={detail} loading={detailLoading} error={detailError} onClose={closeEntity} language={language} />}
  </main>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat-item"><strong>{value.toLocaleString()}</strong><span>{label}</span></div>;
}
