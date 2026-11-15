"use client";

import { SlidersHorizontal } from "lucide-react";
import type { CSSProperties } from "react";
import type { AtlasLanguage } from "./atlas-client";
import { TRANSIT_LINE_COLORS, transitLineLabel } from "@/lib/atlas/transit-modes";
import { ENTITY_TYPE_LABELS, SECTOR_LABELS, STATUS_LABELS, translateLabel } from "@/lib/atlas/labels";

export interface AtlasFilters {
  type: string;
  sector: string;
  status: string;
  mappedOnly: boolean;
}

const types = ["road", "bridge", "interchange", "transit_line", "transit_stop", "rail_station", "city", "district", "airport", "project", "landmark"];
const sectors = ["NORTH", "EAST", "SOUTH", "WEST", "CENTRAL", "REGIONAL"];
const statuses = ["operational", "partial", "under_construction", "planned", "approved_planned", "unknown"];

export function LayerChips({ type, onTypeChange, language }: { type: string; onTypeChange: (type: string) => void; language: AtlasLanguage }) {
  const ar = language === "ar";
  const chips = [
    { key: "", label: ar ? "الكل" : "All" },
    { key: "road", label: ar ? "الطرق" : "Roads" },
    { key: "transport", label: ar ? "النقل" : "Transit" },
    { key: "city", label: ar ? "المدن" : "Cities" },
  ];
  return <div className="layer-chips" role="group" aria-label={ar ? "طبقات الخريطة" : "Map layers"}>
    {chips.map((chip) => <button type="button" key={chip.key} className={type === chip.key ? "layer-chip selected" : "layer-chip"} aria-pressed={type === chip.key} onClick={() => onTypeChange(chip.key)}>{chip.label}</button>)}
  </div>;
}

export function MapFilters({ filters, onChange, language }: { filters: AtlasFilters; onChange: (filters: AtlasFilters) => void; language: AtlasLanguage }) {
  const ar = language === "ar";
  const set = (key: "type" | "sector" | "status", value: string) => onChange({ ...filters, [key]: value });
  return <div className="map-filter-row" aria-label={ar ? "تصفية الكيانات" : "Filter entities"}>
    <label><span><SlidersHorizontal aria-hidden="true" />{ar ? "نوع" : "Type"}</span><select value={filters.type} onChange={(event) => set("type", event.target.value)} aria-label={ar ? "تصفية حسب النوع" : "Filter by type"}>
      <option value="">{ar ? "كل الأنواع" : "All types"}</option>{types.map((value) => <option key={value} value={value} title={value}>{translateLabel(ENTITY_TYPE_LABELS, value, language)}</option>)}
    </select></label>
    <label><span>{ar ? "القطاع" : "Sector"}</span><select value={filters.sector} onChange={(event) => set("sector", event.target.value)} aria-label={ar ? "تصفية حسب القطاع" : "Filter by sector"}>
      <option value="">{ar ? "كل القطاعات" : "All sectors"}</option>{sectors.map((value) => <option key={value} value={value} title={value}>{translateLabel(SECTOR_LABELS, value, language)}</option>)}
    </select></label>
    <label><span>{ar ? "الحالة" : "Status"}</span><select value={filters.status} onChange={(event) => set("status", event.target.value)} aria-label={ar ? "تصفية حسب الحالة" : "Filter by status"}>
      <option value="">{ar ? "كل الحالات" : "All statuses"}</option>{statuses.map((value) => <option key={value} value={value} title={value}>{translateLabel(STATUS_LABELS, value, language)}</option>)}
    </select></label>
    <label className="mapped-only-filter"><input type="checkbox" checked={filters.mappedOnly} onChange={(event) => onChange({ ...filters, mappedOnly: event.target.checked })} />
      <span>{ar ? "المُرسوم فقط" : "Mapped only"}</span></label>
  </div>;
}

export type AtlasLayerGroup = "infrastructure" | "transport" | "areas" | "projects" | "reference";
export type AtlasLayerGroupState = Record<AtlasLayerGroup, boolean>;
const layerGroupNames: Record<AtlasLayerGroup, { ar: string; en: string }> = {
  infrastructure: { ar: "البنية التحتية · الطرق والمحاور والكباري والأنفاق", en: "Infrastructure · roads, axes, bridges & tunnels" },
  transport: { ar: "النقل العام · خطوط النقل والمحطات", en: "Public transport · lines and stations" },
  areas: { ar: "المناطق · المدن والأحياء والحدود", en: "Areas · cities, districts and boundaries" },
  projects: { ar: "المشروعات · إنشاء ومخطط ومعتمد", en: "Projects · construction, planned and approved" },
  reference: { ar: "مرجع OSM · شبكات الطرق والسكك", en: "OSM reference · road and rail networks" },
};
export function LayerGroupToggles({ enabled, onChange, language }: { enabled: AtlasLayerGroupState; onChange: (group: AtlasLayerGroup, value: boolean) => void; language: AtlasLanguage }) {
  const ar = language === "ar";
  return <fieldset className="layer-group-toggles"><legend>{ar ? "مجموعات الطبقات" : "Layer groups"}</legend>
    {(Object.keys(layerGroupNames) as AtlasLayerGroup[]).map((group) => <label key={group} title={group}>
      <input type="checkbox" checked={enabled[group]} onChange={(event) => onChange(group, event.target.checked)} />
      <span>{layerGroupNames[group][language]}</span>
    </label>)}
  </fieldset>;
}

export function TransitLineToggles({ visibleLines, onChange, language }: { visibleLines: string[]; onChange: (lineCode: string, visible: boolean) => void; language: AtlasLanguage }) {
  const ar = language === "ar";
  return <fieldset className="transit-line-toggles"><legend>{ar ? "خطوط النقل" : "Transit lines"}</legend>
    {Object.entries(TRANSIT_LINE_COLORS).map(([code, color]) => <label key={code} title={code}>
      <input type="checkbox" checked={visibleLines.includes(code)} onChange={(event) => onChange(code, event.target.checked)} />
      <i className={code === "TRANSIT-METRO-L4" ? "line-swatch is-dashed" : "line-swatch"} style={{ "--line-toggle-color": color } as CSSProperties} />{transitLineLabel(code, language)}
    </label>)}
  </fieldset>;
}

export function ActiveFilterChips({ filters, quickLayer, onClearFilter, onClearQuick, onClearAll, language }: { filters: AtlasFilters; quickLayer: string; onClearFilter: (key: keyof AtlasFilters) => void; onClearQuick: () => void; onClearAll: () => void; language: AtlasLanguage }) {
  const ar = language === "ar";
  const chips: Array<{key: keyof AtlasFilters | "quick"; text: string}> = [];
  if (quickLayer) chips.push({key: "quick", text: quickLayer === "road" ? (ar ? "الطرق" : "Roads") : quickLayer === "city" ? (ar ? "المدن" : "Cities") : (ar ? "النقل" : "Transit")});
  if (filters.type) chips.push({key: "type", text: translateLabel(ENTITY_TYPE_LABELS, filters.type, language)});
  if (filters.sector) chips.push({key: "sector", text: translateLabel(SECTOR_LABELS, filters.sector, language)});
  if (filters.status) chips.push({key: "status", text: translateLabel(STATUS_LABELS, filters.status, language)});
  if (filters.mappedOnly) chips.push({key: "mappedOnly", text: ar ? "المُرسوم فقط" : "Mapped only"});
  if (!chips.length) return null;
  return <div className="active-filter-chips" aria-label={ar ? "الفلاتر النشطة" : "Active filters"}>
    {chips.map(({key,text}) => <button type="button" key={key} onClick={() => key === "quick" ? onClearQuick() : onClearFilter(key)}>{text} <span aria-hidden="true">×</span></button>)}
    <button type="button" className="clear-all-filters" onClick={onClearAll}>{ar ? "مسح الكل" : "Clear all"}</button>
  </div>;
}

export function Legend({ language, boundaryActive = false, boundaryLabel }: { language: AtlasLanguage; boundaryActive?: boolean; boundaryLabel?: string | null }) {
  const ar = language === "ar";
  const rows = [
    ["operational", "solid"], ["partial", "dash"], ["under_construction", "dash"],
    ["planned", "dot"], ["approved_planned", "dot"], ["unknown", "muted"],
  ] as const;
  return <aside className="map-legend" aria-label={ar ? "مفتاح الخريطة" : "Map legend"}>
    <strong>{ar ? "حالة الكيان" : "Entity status"}</strong>
    {rows.map(([status, style]) => <div className="legend-row" key={status}><i className={`legend-line ${style} status-${status}`} /><span title={status}>{translateLabel(STATUS_LABELS, status, language)}</span></div>)}
    <strong className="legend-type-heading">{ar ? "نوع الهندسة" : "Geometry type"}</strong>
    <div className="legend-row"><i className="legend-line type-road" />{ar ? "الطرق" : "Roads"}</div>
    <div className="legend-row"><i className="legend-polygon" />{ar ? "مضلعات الكيانات والحدود" : "Entity polygons and boundaries"}</div>
    <strong className="legend-type-heading">{ar ? "خطوط النقل وألوانها" : "Transit lines and colors"}</strong>
    {Object.entries(TRANSIT_LINE_COLORS).map(([code, color]) => <div className="legend-row transit-legend-row" key={code}>
      <i className={`legend-line ${code === "TRANSIT-METRO-L4" ? "dash" : "solid"}`} style={{ borderColor: color }} />
      <span title={code}>{transitLineLabel(code, language)}</span>
    </div>)}
    <div className="legend-row transit-legend-row"><i className="transit-shape transit-shape-hexagon" style={{ "--transit-mode-color": "#6c7475" } as CSSProperties} />{ar ? "محطة — الخط غير موثق" : "Station — line undocumented"}</div>
    <div className="legend-row transit-legend-row"><i className="transit-interchange-symbol" />{ar ? "تبادل؛ مرّر المؤشر لمعرفة الخطوط" : "Interchange; hover to list lines"}</div>
    {boundaryActive && <div className="legend-row"><i className="legend-boundary" />{boundaryLabel || (ar ? "حدود إدارية من OSM" : "OSM area boundary")}</div>}
    <small>{ar ? "الخطوط والحدود من هندسة موثقة فقط." : "Lines and boundaries are source geometries only."}</small>
  </aside>;
}

const opacityGroupNames: Record<AtlasLayerGroup, { ar: string; en: string }> = {
  infrastructure: { ar: "البنية التحتية", en: "Infrastructure" },
  transport: { ar: "النقل العام", en: "Public transport" },
  areas: { ar: "المناطق والحدود", en: "Areas & boundaries" },
  projects: { ar: "المشروعات", en: "Projects" },
  reference: { ar: "المرجع", en: "Reference network" },
};

/**
 * BATCH 14.2 — opacity sliders, one per layer group.
 *
 * Kept inside «تفاصيل أكتر» so the simple panel stays simple: someone who only wants to see the map should
 * not have to parse five sliders to find the layer toggles. The percentage is shown because a slider
 * position is not a number a reader can quote or compare.
 */
export function LayerOpacityControls({ opacity, onChange, onReset, isDefault, language }: {
  opacity: Record<AtlasLayerGroup, number>;
  onChange: (group: AtlasLayerGroup, value: number) => void;
  onReset: () => void;
  isDefault: boolean;
  language: AtlasLanguage;
}) {
  const ar = language === "ar";
  return <fieldset className="layer-opacity-controls">
    <legend>{ar ? "شفافية الطبقات" : "Layer opacity"}</legend>
    {(Object.keys(opacityGroupNames) as AtlasLayerGroup[]).map((group) => (
      <label key={group} className="layer-opacity-row">
        <span className="layer-opacity-name">{opacityGroupNames[group][language]}</span>
        <input type="range" min={10} max={100} step={5} value={Math.round(opacity[group] * 100)}
          aria-label={`${opacityGroupNames[group][language]} · ${ar ? "الشفافية" : "opacity"}`}
          aria-valuetext={`${Math.round(opacity[group] * 100)}%`}
          onChange={(event) => onChange(group, Number(event.target.value) / 100)} />
        <output>{Math.round(opacity[group] * 100)}%</output>
      </label>
    ))}
    <button type="button" className="quiet-button layer-opacity-reset" onClick={onReset} disabled={isDefault}>
      {ar ? "إعادة الضبط" : "Reset display"}
    </button>
    <small>{ar
      ? "تُحفظ إعدادات العرض في هذا المتصفح فقط. الرابط المشترك يتقدّم على المحفوظ."
      : "Display settings are saved in this browser only. A shared link overrides what is saved."}</small>
  </fieldset>;
}
