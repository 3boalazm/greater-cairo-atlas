"use client";

import type { CSSProperties } from "react";
import { TRANSIT_MODE_LABELS, TRANSIT_MODE_ORDER, type TransitMode } from "@/lib/atlas/transit-modes";
import type { AtlasLanguage } from "./atlas-client";

export function TransitModeFilter({ visibleModes, onChange, showInterchanges, onInterchangesChange, language }: {
  visibleModes: readonly TransitMode[];
  onChange: (mode: TransitMode, visible: boolean) => void;
  showInterchanges: boolean;
  onInterchangesChange: (visible: boolean) => void;
  language: AtlasLanguage;
}) {
  const ar = language === "ar";
  return <fieldset className="transit-mode-filter">
    <legend>{ar ? "النقل حسب الوسيلة" : "Transit by mode"}</legend>
    <div className="transit-mode-options">
      {TRANSIT_MODE_ORDER.map((mode) => <label key={mode} className="transit-mode-option">
        <input type="checkbox" checked={visibleModes.includes(mode)} onChange={(event) => onChange(mode, event.target.checked)} />
        <i className={`transit-shape transit-shape-${TRANSIT_MODE_LABELS[mode].shape}`} style={{ "--transit-mode-color": TRANSIT_MODE_LABELS[mode].color } as CSSProperties} aria-hidden="true" />
        <span>{TRANSIT_MODE_LABELS[mode][language]}</span>
      </label>)}
      <label className="transit-mode-option transit-interchange-option">
        <input type="checkbox" checked={showInterchanges} onChange={(event) => onInterchangesChange(event.target.checked)} />
        <i className="transit-interchange-symbol" aria-hidden="true" />
        <span>{ar ? "المحطات التبادلية" : "Interchanges"}</span>
      </label>
    </div>
  </fieldset>;
}
