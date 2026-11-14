"use client";

import { Activity, ChevronLeft, ChevronRight, Compass, MapPinOff, Search, ShieldCheck } from "lucide-react";
import type { AtlasEntitySummary, AtlasLanguage } from "./atlas-client";

const statusText: Record<string, { ar: string; en: string }> = {
  operational: { ar: "يعمل", en: "Operational" },
  partial: { ar: "يعمل جزئيًا", en: "Partial" },
  under_construction: { ar: "قيد الإنشاء", en: "Under construction" },
  planned: { ar: "مخطط", en: "Planned" },
  approved_planned: { ar: "مخطط ومعتمد", en: "Approved plan" },
  unknown: { ar: "غير معلوم", en: "Unknown" },
};

export function AppSidebar({ entities, loading, selectedCode, onSelect, language }: {
  entities: AtlasEntitySummary[];
  loading: boolean;
  selectedCode: string | null;
  onSelect: (code: string) => void;
  language: AtlasLanguage;
}) {
  const ar = language === "ar";
  return <aside className="atlas-sidebar" aria-label={ar ? "قائمة الكيانات" : "Entity list"}>
    <div className="atlas-brand">
      <div className="brand-symbol"><Compass aria-hidden="true" /></div>
      <div><strong>{ar ? "أطلس القاهرة الكبرى" : "Greater Cairo Atlas"}<small>CAIRO · EGYPT</small></strong></div>
    </div>
    <div className="sidebar-context"><span className="context-dot" />{ar ? "أطلس حضري موثّق" : "Evidence-led urban atlas"}</div>
    <div className="sidebar-section-heading">
      <span>{ar ? "الكيانات" : "Entities"}</span>
      <span className="entity-count">{loading ? "…" : entities.length}</span>
    </div>
    <nav className="entity-list" aria-label={ar ? "تصفح الكيانات" : "Browse entities"}>
      {loading && entities.length === 0 && <p className="sidebar-state" role="status">{ar ? "جارٍ تحميل الكيانات…" : "Loading entities…"}</p>}
      {!loading && entities.length === 0 && <p className="sidebar-state">{ar ? "لا توجد كيانات مطابقة للفلاتر." : "No entities match these filters."}</p>}
      {entities.map((entity) => <button key={entity.code} className={`entity-list-item ${selectedCode === entity.code ? "is-selected" : ""}`} onClick={() => onSelect(entity.code)} aria-current={selectedCode === entity.code ? "true" : undefined}>
        <span className={`entity-type-mark mark-${entity.entity_type}`} aria-hidden="true" />
        <span className="entity-list-name"><strong>{ar ? entity.name_ar : entity.name_en}</strong><small>{ar ? entity.name_en : entity.name_ar}</small>
          <span className="entity-list-meta"><i className={`status-dot status-${entity.status}`} />{statusText[entity.status]?.[language] ?? entity.status}
            {!entity.has_geometry && <span className="entity-unmapped-icon" title={ar ? "غير مرسوم على الخريطة" : "Not mapped"} aria-label={ar ? "غير مرسوم على الخريطة" : "Not mapped"}><MapPinOff aria-hidden="true" /></span>}
          </span>
        </span>
        {ar ? <ChevronLeft className="item-chevron" aria-hidden="true" /> : <ChevronRight className="item-chevron" aria-hidden="true" />}
      </button>)}
    </nav>
    <div className="sidebar-footnote"><ShieldCheck aria-hidden="true" /><span>{ar ? "حالات التشغيل والمصادر ظاهرة لكل سجل؛ المخطط ليس تشغيلًا." : "Lifecycle and evidence are explicit; planned is not operational."}</span></div>
    <div className="sidebar-footline"><Activity aria-hidden="true" /><span>{ar ? "مصادر قابلة للفحص" : "Auditable sources"}</span></div>
  </aside>;
}

export function EntitySearchIcon() {
  return <Search aria-hidden="true" />;
}
