"use client";

import { MapPinOff, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { AtlasEntityDetail, AtlasEntityFact, AtlasLanguage } from "./atlas-client";

const stateLabel: Record<string, { ar: string; en: string }> = {
  candidate: { ar: "مرشح", en: "Candidate" }, single_source: { ar: "مصدر واحد", en: "Single source" },
  corroborated: { ar: "مؤيد بمصادر", en: "Corroborated" }, verified: { ar: "موثّق", en: "Verified" },
  disputed: { ar: "متنازع عليه", en: "Disputed" }, rejected: { ar: "مرفوض", en: "Rejected" }, superseded: { ar: "مستبدل", en: "Superseded" },
};
const statusLabel: Record<string, { ar: string; en: string }> = {
  operational: { ar: "يعمل", en: "Operational" }, partial: { ar: "يعمل جزئيًا", en: "Partial" },
  under_construction: { ar: "قيد الإنشاء", en: "Under construction" }, planned: { ar: "مخطط", en: "Planned" },
  approved_planned: { ar: "مخطط ومعتمد", en: "Approved planned" }, unknown: { ar: "غير معلوم", en: "Unknown" },
};

function dateText(fact: AtlasEntityFact, ar: boolean): string | null {
  if (!fact.valid_as_of) return null;
  const value = fact.valid_as_of.slice(0, fact.valid_as_of_precision === "day" ? 10 : fact.valid_as_of_precision === "month" ? 7 : 4);
  if (!ar || fact.valid_as_of_precision === "year") return value;
  return fact.valid_as_of_precision === "month" ? `${value} · شهر` : `${value} · يوم`;
}

function FactCard({ fact, language }: { fact: AtlasEntityFact; language: AtlasLanguage }) {
  const ar = language === "ar";
  const faded = fact.verification_state === "superseded" || fact.verification_state === "rejected";
  return <article className={`fact-card ${faded ? "fact-deemphasized" : ""}`}>
    <div className="fact-value-row"><strong>{fact.value}{fact.unit ? <small> {fact.unit}</small> : null}</strong><span className={`verification-badge verification-${fact.verification_state}`}>{stateLabel[fact.verification_state]?.[language] ?? fact.verification_state}</span></div>
    <div className="fact-meta">
      {dateText(fact, ar) && <span>{ar ? "صالح بتاريخ" : "Valid as of"} {dateText(fact, ar)}{fact.valid_as_of_precision !== "day" ? ` · ${ar ? `دقة ${fact.valid_as_of_precision === "month" ? "شهر" : "سنة"}` : `${fact.valid_as_of_precision} precision`}` : ""}</span>}
      {fact.notes && <p>{fact.notes}</p>}
    </div>
    {fact.evidence.length > 0 ? <ul className="evidence-list" aria-label={ar ? "المصادر" : "Sources"}>
      {fact.evidence.map((source) => <li key={source.code}>
        <span className="source-type">{source.source_type}</span>
        <div><strong>{source.publisher}</strong>{source.source_type === "secondary" && <span className="weak-source">{ar ? "مصدر ثانوي · ضعيف" : "Secondary · weak source"}</span>}
          {source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}<span className="sr-only"> ({ar ? "يفتح في تبويب جديد" : "opens in a new tab"})</span></a> : <span className="source-no-url">{source.title} · {ar ? "لا يوجد رابط" : "No URL"}</span>}
          <small>{source.code}{source.accessed_date ? ` · ${ar ? "اطّلع عليه" : "accessed"} ${source.accessed_date}` : ""}</small>
        </div>
      </li>)}
    </ul> : <p className="no-evidence">{ar ? "لا توجد إحالات مصدرية مرتبطة." : "No linked evidence records."}</p>}
  </article>;
}

export function EntityPanel({ entity, loading, error, onClose, language }: {
  entity: AtlasEntityDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  language: AtlasLanguage;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const ar = language === "ar";
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    panel.addEventListener("keydown", trapTab);
    return () => panel.removeEventListener("keydown", trapTab);
  }, []);
  const groups = useMemo(() => {
    const map = new Map<string, AtlasEntityFact[]>();
    for (const fact of entity?.facts ?? []) map.set(fact.attribute, [...(map.get(fact.attribute) ?? []), fact]);
    return [...map.entries()];
  }, [entity?.facts]);
  return <>
    <button className="panel-backdrop" tabIndex={-1} onClick={onClose} aria-label={ar ? "إغلاق تفاصيل الكيان" : "Close entity details"} />
    <aside ref={panelRef} className="entity-panel" role="dialog" aria-modal="true" aria-labelledby="entity-panel-title" aria-busy={loading}>
      <div className="sheet-grab" aria-hidden="true"><span /></div>
      <header className="entity-panel-header">
        <div className="entity-overline">{entity?.entity_type ?? "ATLAS ENTITY"} <span>·</span> {entity?.sector}</div>
        <button ref={closeRef} className="close-panel" type="button" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}><X aria-hidden="true" /></button>
        {entity ? <><h2 id="entity-panel-title">{ar ? entity.name_ar : entity.name_en}</h2><p className="entity-subtitle">{ar ? entity.name_en : entity.name_ar} <span>·</span> {entity.code}</p>
          <div className="entity-badges"><span className={`status-pill status-${entity.status}`}>{statusLabel[entity.status]?.[language] ?? entity.status}</span>

          </div></> : <h2 id="entity-panel-title">{loading ? (ar ? "جارٍ تحميل الكيان…" : "Loading entity…") : (ar ? "تعذر تحميل الكيان" : "Unable to load entity")}</h2>}
      </header>
      <div className="entity-panel-content">
        {loading && <p className="panel-state" role="status">{ar ? "جارٍ جلب الحقائق والمصادر…" : "Loading facts and evidence…"}</p>}
        {!loading && error && <div className="panel-error" role="alert">{error}</div>}
        {!loading && entity && <>
          {!entity.has_geometry && <p className="entity-unmapped-note"><MapPinOff aria-hidden="true" />{ar ? "غير مرسوم على الخريطة" : "Not mapped"}</p>}
          {entity.description && <p className="entity-description">{entity.description}</p>}
          <section aria-labelledby="facts-heading">
            <div className="panel-section-heading"><span className="section-index">01</span><div><h3 id="facts-heading">{ar ? "الحقائق والمصادر" : "Facts & evidence"}</h3><small>{ar ? "التعارضات معروضة جنبًا إلى جنب دون ترجيح آلي" : "Conflicting claims stay side by side; no automatic winner."}</small></div></div>
            {groups.length ? groups.map(([attribute, facts]) => <div className="fact-group" key={attribute}>
              <h4>{attribute.replaceAll("_", " ")}{facts.length > 1 && <span>{ar ? `${facts.length} قيم متعارضة/متعددة` : `${facts.length} claims`}</span>}</h4>
              <div className={facts.length > 1 ? "fact-grid conflicting-facts" : "fact-grid"}>{facts.map((fact) => <FactCard key={fact.code} fact={fact} language={language} />)}</div>
            </div>) : <p className="panel-state">{ar ? "لا توجد حقائق مسجلة لهذا الكيان." : "No facts are recorded for this entity."}</p>}
          </section>
        </>}
      </div>
      <footer className="entity-panel-footer">{ar ? "المصادر تُعرض كما سُجلت؛ المصدر الثانوي وحده لا يثبت الادعاء." : "Sources are shown as recorded; a secondary source alone is not proof."}</footer>
    </aside>
  </>;
}
