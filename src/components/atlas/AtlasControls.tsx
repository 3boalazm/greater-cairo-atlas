"use client";

import { SlidersHorizontal } from "lucide-react";
import type { AtlasLanguage } from "./atlas-client";

export interface AtlasFilters {
  type: string;
  sector: string;
  status: string;
}

const types = ["road", "bridge", "interchange", "transit_line", "transit_stop", "rail_station", "city", "district", "airport", "project", "landmark"];
const sectors = ["NORTH", "EAST", "SOUTH", "WEST", "CENTRAL", "REGIONAL"];
const statuses = ["operational", "partial", "under_construction", "planned", "approved_planned", "unknown"];
const typeLabel: Record<string, { ar: string; en: string }> = {
  road: { ar: "طرق", en: "Roads" }, bridge: { ar: "جسور", en: "Bridges" }, interchange: { ar: "تقاطع", en: "Interchanges" },
  transit_line: { ar: "خطوط نقل", en: "Transit lines" }, transit_stop: { ar: "محطات", en: "Stops" }, rail_station: { ar: "محطات سكك", en: "Rail stations" },
  city: { ar: "مدن", en: "Cities" }, district: { ar: "أحياء", en: "Districts" }, airport: { ar: "مطارات", en: "Airports" }, project: { ar: "مشروعات", en: "Projects" }, landmark: { ar: "معالم", en: "Landmarks" },
};
const sectorLabel: Record<string, { ar: string; en: string }> = {
  NORTH: { ar: "الشمال", en: "North" }, EAST: { ar: "الشرق", en: "East" }, SOUTH: { ar: "الجنوب", en: "South" },
  WEST: { ar: "الغرب", en: "West" }, CENTRAL: { ar: "الوسط", en: "Central" }, REGIONAL: { ar: "إقليمي", en: "Regional" },
};
const statusLabel: Record<string, { ar: string; en: string }> = {
  operational: { ar: "يعمل", en: "Operational" }, partial: { ar: "يعمل جزئيًا", en: "Partial" }, under_construction: { ar: "قيد الإنشاء", en: "Under construction" },
  planned: { ar: "مخطط", en: "Planned" }, approved_planned: { ar: "مخطط ومعتمد", en: "Approved plan" }, unknown: { ar: "غير معلوم", en: "Unknown" },
};

export function LayerChips({ type, onTypeChange, language }: { type: string; onTypeChange: (type: string) => void; language: AtlasLanguage }) {
  const ar = language === "ar";
  const chips = [
    { key: "", label: ar ? "الكل" : "All" },
    { key: "road", label: ar ? "الطرق" : "Roads" },
    { key: "transit_line", label: ar ? "خطوط النقل" : "Transit" },
    { key: "transit_stop", label: ar ? "المحطات" : "Stops" },
  ];
  return <div className="layer-chips" role="group" aria-label={ar ? "طبقات الخريطة" : "Map layers"}>
    {chips.map((chip) => <button type="button" key={chip.key} className={type === chip.key ? "layer-chip selected" : "layer-chip"} aria-pressed={type === chip.key} onClick={() => onTypeChange(chip.key)}>{chip.label}</button>)}
  </div>;
}

export function MapFilters({ filters, onChange, language }: { filters: AtlasFilters; onChange: (filters: AtlasFilters) => void; language: AtlasLanguage }) {
  const ar = language === "ar";
  const set = (key: keyof AtlasFilters, value: string) => onChange({ ...filters, [key]: value });
  return <div className="map-filter-row" aria-label={ar ? "تصفية الكيانات" : "Filter entities"}>
    <label><span><SlidersHorizontal aria-hidden="true" />{ar ? "نوع" : "Type"}</span><select value={filters.type} onChange={(event) => set("type", event.target.value)} aria-label={ar ? "تصفية حسب النوع" : "Filter by type"}>
      <option value="">{ar ? "كل الأنواع" : "All types"}</option>{types.map((value) => <option key={value} value={value}>{typeLabel[value]?.[language] ?? value}</option>)}
    </select></label>
    <label><span>{ar ? "القطاع" : "Sector"}</span><select value={filters.sector} onChange={(event) => set("sector", event.target.value)} aria-label={ar ? "تصفية حسب القطاع" : "Filter by sector"}>
      <option value="">{ar ? "كل القطاعات" : "All sectors"}</option>{sectors.map((value) => <option key={value} value={value}>{sectorLabel[value]?.[language] ?? value}</option>)}
    </select></label>
    <label><span>{ar ? "الحالة" : "Status"}</span><select value={filters.status} onChange={(event) => set("status", event.target.value)} aria-label={ar ? "تصفية حسب الحالة" : "Filter by status"}>
      <option value="">{ar ? "كل الحالات" : "All statuses"}</option>{statuses.map((value) => <option key={value} value={value}>{statusLabel[value]?.[language] ?? value}</option>)}
    </select></label>
  </div>;
}

export function Legend({ language }: { language: AtlasLanguage }) {
  const ar = language === "ar";
  const rows = [
    ["operational", ar ? "يعمل" : "Operational", "solid"],
    ["partial", ar ? "يعمل جزئيًا" : "Partial", "dash"],
    ["under_construction", ar ? "قيد الإنشاء" : "Under construction", "dash"],
    ["planned", ar ? "مخطط" : "Planned", "dot"],
    ["approved_planned", ar ? "مخطط ومعتمد" : "Approved planned", "dot"],
    ["unknown", ar ? "غير معلوم" : "Unknown", "muted"],
  ];
  return <aside className="map-legend" aria-label={ar ? "مفتاح الخريطة" : "Map legend"}>
    <strong>{ar ? "حالة الكيان" : "Entity status"}</strong>
    {rows.map(([status, label, style]) => <div className="legend-row" key={status}><i className={`legend-line ${style} status-${status}`} />{label}</div>)}
    <small>{ar ? "الخطوط تشير إلى هندسة موثقة فقط." : "Lines are sourced geometries only."}</small>
  </aside>;
}
