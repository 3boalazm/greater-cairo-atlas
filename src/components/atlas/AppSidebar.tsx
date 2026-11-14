"use client";

import { Activity, ChevronLeft, ChevronRight, Compass, MapPinOff, Search, ShieldCheck } from "lucide-react";
import type { AtlasEntitySummary, AtlasLanguage } from "./atlas-client";
import { STATUS_LABELS, stationDisplayName, translateLabel } from "@/lib/atlas/labels";

export function AppSidebar({ entities, loading, selectedCode, onSelect, language, regionalCodes }: {
  entities: AtlasEntitySummary[];
  loading: boolean;
  selectedCode: string | null;
  onSelect: (code: string) => void;
  language: AtlasLanguage;
  regionalCodes: string[];
}) {
  const ar = language === "ar";
  const regional = new Set(regionalCodes);
  const localEntities = entities.filter((entity) => entity.sector !== "REGIONAL" && !regional.has(entity.code));
  const regionalEntities = entities.filter((entity) => entity.sector === "REGIONAL" || regional.has(entity.code));
  const renderEntity = (entity: AtlasEntitySummary) => <button key={entity.code} className={`entity-list-item ${selectedCode === entity.code ? "is-selected" : ""}`} onClick={() => onSelect(entity.code)} aria-current={selectedCode === entity.code ? "true" : undefined}>
    <span className={`entity-type-mark mark-${entity.entity_type}`} aria-hidden="true" />
    <span className="entity-list-name"><strong>{stationDisplayName(entity.code, ar ? entity.name_ar : entity.name_en)}</strong><small>{ar ? entity.name_en : entity.name_ar}</small>
      <span className="entity-list-meta"><i className={`status-dot status-${entity.status}`} /><span title={entity.status}>{translateLabel(STATUS_LABELS, entity.status, language)}</span>
        {!entity.has_geometry && <span className="entity-unmapped-icon" title={ar ? "لا توجد هندسة مسجلة لهذا الكيان" : "No geometry is recorded for this entity"} aria-label={ar ? "لا توجد هندسة مسجلة لهذا الكيان" : "No geometry is recorded for this entity"}><MapPinOff aria-hidden="true" /></span>}
      </span>
    </span>
    {ar ? <ChevronLeft className="item-chevron" aria-hidden="true" /> : <ChevronRight className="item-chevron" aria-hidden="true" />}
  </button>;
  return <aside className="atlas-sidebar" aria-label={ar ? "قائمة الكيانات" : "Entity list"}>
    <div className="atlas-brand">
      <div className="brand-symbol"><Compass aria-hidden="true" /></div>
      <div><strong>{ar ? "أطلس القاهرة الكبرى" : "Greater Cairo Atlas"}<small>CAIRO · EGYPT</small></strong></div>
    </div>
    <div className="sidebar-context"><span className="context-dot" />{ar ? "أطلس حضري موثّق" : "Evidence-led urban atlas"}</div>
    <div className="sidebar-section-heading">
      <span>{ar ? "الكيانات" : "Entities"}</span>
      <span className="entity-count">{entities.length}</span>
    </div>
    <nav className="entity-list" aria-label={ar ? "تصفح الكيانات" : "Browse entities"}>
      {loading && entities.length === 0 && <p className="sidebar-state" role="status">{ar ? "جارٍ تحميل الكيانات…" : "Loading entities…"}</p>}
      {!loading && entities.length === 0 && <p className="sidebar-state">{ar ? "لا توجد كيانات مطابقة للفلاتر." : "No entities match these filters."}</p>}
      {localEntities.map(renderEntity)}
      {regionalEntities.length > 0 && <div className="regional-entity-group"><h3>{ar ? "نقاط ربط إقليمية" : "Regional connection points"}</h3>{regionalEntities.map(renderEntity)}</div>}
    </nav>
    <div className="sidebar-footnote"><ShieldCheck aria-hidden="true" /><span>{ar ? "حالات التشغيل والمصادر ظاهرة لكل سجل؛ المخطط ليس تشغيلًا." : "Lifecycle and evidence are explicit; planned is not operational."}</span></div>
    <div className="sidebar-footline"><Activity aria-hidden="true" /><span>{ar ? "مصادر قابلة للفحص" : "Auditable sources"}</span></div>
  </aside>;
}

export function EntitySearchIcon() {
  return <Search aria-hidden="true" />;
}
