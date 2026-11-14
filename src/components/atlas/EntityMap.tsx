"use client";

import { MapView } from "./MapView";
import type { AtlasFeatureCollection } from "./atlas-client";

const noop = () => undefined;

export function EntityMap({ features, language }: { features: AtlasFeatureCollection; language: "ar" | "en" }) {
  return <div className="entity-map-frame">
    <div className="entity-map-stage">
      <MapView
        theme="night"
        features={features}
        onSelect={noop}
        onZoomChange={noop}
        onStyleStatus={noop}
        language={language}
        fitToFeatures
        compact
      />
      <span className="entity-map-attribution">© OpenStreetMap contributors, ODbL 1.0 · OpenFreeMap</span>
    </div>
  </div>;
}
