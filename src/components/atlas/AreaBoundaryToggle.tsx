"use client";
import dynamic from "next/dynamic";
import { MapPinned } from "lucide-react";
import { useState } from "react";
import type { AreaBoundaryFeature } from "@/lib/atlas/area-boundaries";
import { useAtlasPreferences } from "./Preferences";
import type { AtlasFeatureCollection, AtlasLanguage } from "./atlas-client";

const LazyMapView = dynamic(
  () => import("./MapView").then((module) => module.MapView),
  { ssr: false, loading: () => <div className="entity-map-placeholder" role="status" /> },
);
const EMPTY_FEATURES: AtlasFeatureCollection = {
  type: "FeatureCollection",
  metadata: { data_license: "", geometry_license: "© OpenStreetMap contributors, ODbL 1.0", contact: "" },
  features: [],
};
const noop = () => undefined;

export function AreaBoundaryToggle({ code, name, language }: { code: string; name: string; language: AtlasLanguage }) {
  const { theme } = useAtlasPreferences();
  const [boundary, setBoundary] = useState<AreaBoundaryFeature | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ar = language === "ar";
  const toggle = async () => {
    if (boundary) { setBoundary(null); setError(null); return; }
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/atlas/entities/${encodeURIComponent(code)}/boundary`);
      const payload = await response.json() as { features?: AreaBoundaryFeature[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      const feature = payload.features?.find((item) => item.properties.entity_code === code);
      if (!feature) throw new Error(ar ? "الحدود غير متاحة في المصدر" : "Boundary unavailable in source");
      setBoundary(feature);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ar ? "تعذّر تحميل الحدود" : "Could not load boundary");
    } finally {
      setLoading(false);
    }
  };
  return <div className="area-boundary-toggle">
    <button className="boundary-toggle" type="button" aria-pressed={Boolean(boundary)} onClick={() => void toggle()} disabled={loading}>
      <MapPinned aria-hidden="true" />{loading ? (ar ? "جارٍ تحميل الحدود…" : "Loading boundary…") : boundary ? (ar ? "إخفاء الحدود" : "Hide boundary") : (ar ? "إظهار الحدود على الخريطة" : "Show boundary on map")}
    </button>
    {error && <p className="boundary-unavailable-note" role="alert">{error}</p>}
    {boundary && <div className="area-boundary-map-wrap" aria-label={ar ? `حدود ${name}` : `${name} boundary`}>
      <div className="area-boundary-map">
        <LazyMapView theme={theme} features={EMPTY_FEATURES} highlightBoundary={boundary} onSelect={noop} onZoomChange={noop} onStyleStatus={noop} language={language} compact />
      </div>
      <p className="map-data-attribution">© OpenStreetMap contributors, ODbL 1.0 · OpenFreeMap</p>
      <p className="area-boundary-name">{name}</p>
    </div>}
  </div>;
}
