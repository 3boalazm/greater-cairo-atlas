"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { AtlasFeatureCollection } from "./atlas-client";

const LazyMapView = dynamic(
  () => import("./MapView").then((module) => module.MapView),
  { ssr: false, loading: () => <div className="entity-map-placeholder" aria-hidden="true" /> },
);

const noop = () => undefined;

export function EntityMap({ features, language, attribution }: { features: AtlasFeatureCollection; language: "ar" | "en"; attribution: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return <div className="entity-map-frame" ref={frameRef}>
    <div className="entity-map-stage">
      {shouldLoad ? <LazyMapView
        theme="night"
        features={features}
        onSelect={noop}
        onZoomChange={noop}
        onStyleStatus={noop}
        language={language}
        fitToFeatures
        compact
      /> : <div className="entity-map-placeholder" role="status" aria-label={language === "ar" ? "الخريطة ستُحمّل عند ظهورها" : "Map loads when visible"} />}
      <span className="entity-map-attribution">{attribution} · OpenFreeMap</span>
    </div>
  </div>;
}
