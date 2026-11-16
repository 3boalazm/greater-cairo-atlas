"use client";

import Link from "next/link";
import { MapPinOff, MapPinned, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CalendarClock, CircleAlert, CircleCheck, Construction } from "lucide-react";
import { useResearchMode } from "@/components/site/ResearchMode";
import { TimelinePanelNote } from "./TimeControl";
import type { TimelineStatusResolution } from "@/lib/atlas/status-timeline";
import type { AtlasEntityDetail, AtlasEntityFact, AtlasLanguage } from "./atlas-client";
import { transitModeLabel } from "@/lib/atlas/transit-modes";
import { partialGeometryNote } from "@/lib/atlas/map-fit";
import { governorateParentLabel } from "@/lib/atlas/entity-relations";
import { pointOutsideBoundaryNote } from "@/lib/atlas/point-outside-boundary";
import { EntityTimeline } from "./EntityTimeline";
import type { GeometryAlternative } from "@/lib/atlas/geometry-comparisons";
import { ENTITY_TYPE_LABELS, FACT_ATTRIBUTE_LABELS, hasDisplayableQuickFactValue, SECTOR_LABELS, showOnMapLabel, SOURCE_TYPE_LABELS, STATUS_LABELS, VERIFICATION_LABELS, quickFactSourceCountLabel, stationDisplayName, translateLabel } from "@/lib/atlas/labels";

const areaEntityTypes = new Set(["city", "district", "neighborhood", "authority"]);

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
    <div className="fact-value-row"><strong>{fact.value}{fact.unit ? <small> {fact.unit}</small> : null}</strong><span className={`verification-badge verification-${fact.verification_state}`}>{translateLabel(VERIFICATION_LABELS, fact.verification_state, language)}</span></div>
    <div className="fact-meta">
      {dateText(fact, ar) && <span>{ar ? "صالح بتاريخ" : "Valid as of"} {dateText(fact, ar)}{fact.valid_as_of_precision !== "day" ? ` · ${ar ? `دقة ${fact.valid_as_of_precision === "month" ? "شهر" : "سنة"}` : `${fact.valid_as_of_precision} precision`}` : ""}</span>}
      {fact.notes && <p>{fact.notes}</p>}
    </div>
    <SourceBadge fact={fact} language={language} />
  </article>;
}

function SourceBadge({ fact, language }: { fact: AtlasEntityFact; language: AtlasLanguage }) {
  const ar = language === "ar";
  return <details className="fact-source-badge"><summary>{ar ? "المصدر" : "Source"}{fact.evidence.length > 1 ? ` (${fact.evidence.length})` : ""}</summary>
    {fact.evidence.length ? <ul className="evidence-list">{fact.evidence.map((source) => <li key={source.code}>
      <span className="source-type">{translateLabel(SOURCE_TYPE_LABELS, source.source_type, language)}</span><div><strong>{source.publisher}</strong>
      <small>{source.published_date ? `${ar ? "نُشر" : "Published"}: ${source.published_date}` : (ar ? "تاريخ النشر غير معروف" : "Publication date unknown")}{source.accessed_date ? ` · ${ar ? "اطّلع عليه" : "accessed"} ${source.accessed_date}` : ""}</small>
      {source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a> : <span className="source-no-url">{source.title || (ar ? "لا يوجد رابط" : "No URL")}</span>}</div>
    </li>)}</ul> : <p className="no-evidence">{ar ? "لا توجد إحالات مصدرية مرتبطة." : "No linked evidence records."}</p>}
  </details>;
}

function simpleStatus(status: string) {
  const translations: Record<string, { ar: string; en: string; icon: typeof CircleCheck }> = {
    operational: { ar: "يعمل", en: "Operating", icon: CircleCheck }, partial: { ar: "يعمل جزئيًا", en: "Partly operating", icon: CircleAlert },
    under_construction: { ar: "تحت الإنشاء", en: "Under construction", icon: Construction },
    planned: { ar: "مخطط", en: "Planned", icon: CalendarClock }, approved_planned: { ar: "مخطط", en: "Planned", icon: CalendarClock },
    unknown: { ar: "غير محدد", en: "Not specified", icon: CalendarClock },
  };
  return translations[status] ?? translations.unknown!;
}

export function EntityPanel({ entity, loading, error, onClose, onShowOnMap, geometryCompleteness = null, language, onToggleBoundary, boundaryActive, boundaryLoading, onSelectRelated, geometryAlternatives = [], timeline }: {
  entity: AtlasEntityDetail | null;
  geometryAlternatives?: GeometryAlternative[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  /** «اعرض على الخريطة» — refit the camera to the selected entity's whole area. */
  onShowOnMap: () => void;
  /** FIX F: `partial_source_geometry` when the drawn line is only a source fragment. */
  geometryCompleteness?: string | null;
  language: AtlasLanguage;
  onToggleBoundary: (code: string) => void;
  boundaryActive: boolean;
  boundaryLoading: boolean;
  onSelectRelated: (code: string) => void;
  /**
   * BATCH 14.1 — present only while «الزمن» is showing a year other than today. Carries the resolver's
   * verdict plus the fact that decided it, so researcher mode can name the evidence instead of asserting
   * a status.
   */
  timeline?: { year: number; resolution: TimelineStatusResolution | null };
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const dragStart = useRef<number | null>(null);
  const didDrag = useRef(false);
  const [actionMessage, setActionMessage] = useState("");
  const ar = language === "ar";
  const { researcherMode } = useResearchMode();
  const partialNote = partialGeometryNote(entity?.code, geometryCompleteness, language);
  /**
   * BATCH 12.4 — one short line in the simple panel: «يتبع: محافظة الجيزة». It is read straight off the
   * CAPMAS-derived `located_in` relation, so it only appears when that relation exists; nothing is
   * guessed from geometry or from the name.
   */
  const governorateParent = useMemo(() => {
    const relation = (entity?.relations ?? []).find((item) => item.predicate === "located_in" &&
      (item.subject_code === entity?.code ? item.object : item.subject)?.entity_type === "authority");
    if (!relation) return null;
    const target = relation.subject_code === entity?.code ? relation.object : relation.subject;
    if (!target) return null;
    return governorateParentLabel(target.name_ar, target.name_en, language);
  }, [entity, language]);
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
  const simpleFactLabels: Record<string, { ar: string; en: string }> = {
    length: { ar: "الطول", en: "Length" }, length_approx: { ar: "الطول التقريبي", en: "Approximate length" },
    total_length: { ar: "الطول الإجمالي", en: "Total length" }, stations_count: { ar: "عدد المحطات", en: "Stations" }, total_stations: { ar: "عدد المحطات", en: "Stations" },
    stations: { ar: "المحطات", en: "Stations" }, capacity_per_day: { ar: "السعة اليومية", en: "Daily capacity" }, population: { ar: "عدد السكان", en: "Population" }, opening_date: { ar: "موعد الافتتاح", en: "Opening date" },
  };
  const simpleFactGroups = new Map<string, NonNullable<typeof entity>["facts"]>();
  for (const fact of (entity?.facts ?? []).filter((item) => item.attribute in simpleFactLabels && hasDisplayableQuickFactValue(item.value) && !["rejected", "superseded"].includes(item.verification_state))) {
    simpleFactGroups.set(fact.attribute, [...(simpleFactGroups.get(fact.attribute) ?? []), fact]);
  }
  const conflicts = groups.filter(([, facts]) => new Set(facts.filter((fact) => !["rejected", "superseded"].includes(fact.verification_state) && /[0-9٠-٩۰-۹]/u.test(fact.value)).map((fact) => JSON.stringify([fact.value, fact.unit]))).size > 1);
  const conflictingAttributes = new Set(conflicts.map(([attribute]) => attribute));
  const simpleFacts = [...simpleFactGroups.entries()].filter(([attribute]) => !conflictingAttributes.has(attribute)).map(([attribute, claims]) => {
    const ordered = [...claims].sort((a, b) => {
      const official = (fact: typeof a) => fact.verification_state === "verified" && fact.evidence.some((item) => item.source_type === "official") ? 1 : 0;
      return official(b) - official(a) || String(b.valid_as_of ?? "").localeCompare(String(a.valid_as_of ?? "")) || a.code.localeCompare(b.code);
    });
    return { fact: ordered[0]!, sourceCount: new Set(ordered.flatMap((item) => item.evidence.map((source) => source.code))).size, attribute };
  }).sort((a, b) => Object.keys(simpleFactLabels).indexOf(a.attribute) - Object.keys(simpleFactLabels).indexOf(b.attribute)).slice(0, 3);
  const related = (entity?.relations ?? []).flatMap((relation) => {
    if (!entity) return [];
    const target = relation.subject_code === entity.code ? relation.object : relation.subject;
    const station = ["transit_stop", "rail_station", "transit_station"].includes(entity.entity_type);
    const area = ["city", "district", "neighborhood"].includes(entity.entity_type);
    if (station && target.entity_type === "transit_line" && relation.predicate === "has_station") return [target];
    if (area && ["road", "bridge", "transit_line"].includes(target.entity_type)) return [target];
    return [];
  });
  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setActionMessage(ar ? "تم النسخ" : "Copied"); }
    catch { setActionMessage(ar ? "تعذّر النسخ" : "Could not copy"); }
  };
  const downloadGeoJSON = async () => {
    if (!entity) return;
    try {
      const response = await fetch(`/api/exports/entities/${encodeURIComponent(entity.code)}`);
      if (!response.ok) throw new Error("export failed");
      const data = await response.json() as { geometry: unknown; geometry_license: unknown; geometry_attribution: unknown };
      if (!data.geometry) throw new Error("no geometry");
      const collection = { type: "FeatureCollection", features: [{ type: "Feature", geometry: data.geometry, properties: { entity_code: entity.code, license: data.geometry_license, attribution: data.geometry_attribution } }] };
      const url = URL.createObjectURL(new Blob([JSON.stringify(collection)], { type: "application/geo+json" }));
      const link = document.createElement("a"); link.href = url; link.download = `${entity.code.toLowerCase()}.geojson`; link.click(); URL.revokeObjectURL(url);
    } catch { setActionMessage(ar ? "تعذّر تنزيل الهندسة" : "Could not download geometry"); }
  };
  const entityLineCodes = entity?.facts.filter((fact) => fact.attribute === "line_membership").map((fact) => fact.value) ?? [];
  const entityModeLabel = entity ? transitModeLabel(entity.code, language, entityLineCodes) : null;
  return <>
    <button className="panel-backdrop" tabIndex={-1} onClick={onClose} aria-label={ar ? "إغلاق تفاصيل الكيان" : "Close entity details"} />
    <aside ref={panelRef} style={sheetHeight === null ? undefined : { "--sheet-height": `${sheetHeight}px` } as CSSProperties} className={`entity-panel ${researcherMode ? "researcher-panel" : "simple-panel"}`} role="dialog" aria-modal="true" aria-labelledby="entity-panel-title" aria-busy={loading}>
      <button type="button" className="sheet-grab" aria-label={ar ? "توسيع أو تصغير لوحة التفاصيل" : "Expand or collapse details"} onClick={() => { if (!didDrag.current) setSheetHeight((height) => height && height > window.innerHeight * 0.7 ? window.innerHeight * 0.45 : window.innerHeight * 0.85); didDrag.current = false; }} onPointerDown={(event) => { if (window.matchMedia("(max-width:760px)").matches) { dragStart.current = event.clientY; didDrag.current = false; event.currentTarget.setPointerCapture(event.pointerId); } }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId) && event.buttons && dragStart.current !== null && Math.abs(event.clientY - dragStart.current) > 4) { didDrag.current = true; setSheetHeight(Math.max(200, Math.min(window.innerHeight * 0.9, window.innerHeight - event.clientY))); } }} onPointerUp={() => { dragStart.current = null; }}><span /></button>
      <header className="entity-panel-header">
        <div className="entity-overline" title={researcherMode ? `${entity?.entity_type ?? "ATLAS ENTITY"} · ${entity?.sector ?? ""}` : undefined}>{entity ? translateLabel(ENTITY_TYPE_LABELS, entity.entity_type, language) : (ar ? "كيان أطلس" : "ATLAS ENTITY")} {researcherMode && entity && <><span>·</span> {translateLabel(SECTOR_LABELS, entity.sector, language)}</>}</div>
        <button ref={closeRef} className="close-panel" type="button" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}><X aria-hidden="true" /></button>
        {entity ? <><h2 id="entity-panel-title">{stationDisplayName(entity.code, ar ? entity.name_ar : entity.name_en)}</h2>
          <p className="entity-subtitle">{ar ? entity.name_en : entity.name_ar} {researcherMode && <button type="button" className="copy-code" onClick={() => void copyText(entity.code)} title={ar ? "نسخ الرمز" : "Copy code"}>{entity.code}</button>}</p>
          <div className="entity-badges">{researcherMode ? <span className={`status-pill status-${entity.status}`} title={entity.status}>{translateLabel(STATUS_LABELS, entity.status, language)}</span> : (() => { const state = simpleStatus(entity.status); const Icon = state.icon; return <span className={`simple-status-word status-${entity.status}`} aria-label={`${ar ? "الحالة" : "Status"}: ${state[language]}`}><Icon aria-hidden="true"/>{state[language]}</span>; })()}
            {researcherMode && entityModeLabel && <span className="transit-mode-pill">{entityModeLabel}</span>}
          </div></> : <h2 id="entity-panel-title">{loading ? (ar ? "جارٍ تحميل الكيان…" : "Loading entity…") : (ar ? "تعذر تحميل الكيان" : "Unable to load entity")}</h2>}
      </header>
      <div className="entity-panel-content">
        {loading && <p className="panel-state" role="status">{ar ? "جارٍ جلب الحقائق والمصادر…" : "Loading facts and evidence…"}</p>}
        {!loading && error && <div className="panel-error" role="alert">{error}</div>}
        {!loading && entity && <>
          {!researcherMode && <section className="simple-entity-summary" aria-label={ar ? "ملخص الكيان" : "Entity summary"}>
            <p className="simple-entity-type">{translateLabel(ENTITY_TYPE_LABELS, entity.entity_type, language)}</p>
            {governorateParent && <p className="simple-entity-parent">{governorateParent}</p>}
            {simpleFacts.length ? <ul>{simpleFacts.map(({ fact, sourceCount }) => <li key={fact.code}><span>{simpleFactLabels[fact.attribute]![language]}</span><strong>{fact.value}{fact.unit ? ` ${fact.unit}` : ""}</strong>{fact.verification_state === "verified" && <span className="official-verified-badge">{ar ? "موثّق رسميًا ✓" : "Officially verified ✓"}</span>}{quickFactSourceCountLabel(sourceCount, language) && <small>{quickFactSourceCountLabel(sourceCount, language)}</small>}<SourceBadge fact={fact} language={language}/></li>)}</ul> : <p className="simple-no-facts">{ar ? "لا توجد معلومات موجزة مسجلة بعد." : "No short facts have been recorded yet."}</p>}
          </section>}
          <div className="entity-quick-actions">
            <button type="button" className="show-on-map-button" onClick={onShowOnMap}>{showOnMapLabel(language)}</button>
            <button type="button" onClick={() => { const url = new URL(window.location.href); url.searchParams.set("entity", entity.code); void copyText(url.toString()); }}>{ar ? "انسخ الرابط" : "Copy link"}</button>
            {researcherMode && <button type="button" disabled={!entity.has_geometry} onClick={() => void downloadGeoJSON()}>{ar ? "تنزيل GeoJSON" : "Download GeoJSON"}</button>}
            {actionMessage && <small role="status">{actionMessage}</small>}
          </div>
          {!researcherMode && conflicts.length > 0 && <details className="simple-conflicts"><summary>{ar ? "في مصادر مختلفة بأرقام مختلفة" : "Sources report different values"}</summary>{conflicts.map(([attribute, facts]) => <section key={attribute}><h4>{translateLabel(FACT_ATTRIBUTE_LABELS, attribute, language)}</h4><div className="fact-grid conflicting-facts">{facts.filter((fact) => !["rejected", "superseded"].includes(fact.verification_state)).map((fact) => <article className="fact-card" key={fact.code}><strong>{fact.value}{fact.unit ? ` ${fact.unit}` : ""}</strong><SourceBadge fact={fact} language={language} /></article>)}</div></section>)}</details>}
          {!researcherMode && (related.length > 0 || (entity.neighbors?.length ?? 0) > 0) && <section className="simple-related"><h3>{ar ? "كيانات مرتبطة" : "Linked entities"}</h3><ul>{related.map((item) => <li key={item.code}><button type="button" onClick={() => onSelectRelated(item.code)}>{ar ? item.name_ar : item.name_en}</button></li>)}{entity.neighbors?.map((neighbor) => <li key={`${neighbor.subject_code}:${neighbor.object_code}`}><button type="button" onClick={() => onSelectRelated(neighbor.object_code)}>{neighbor.direction === "previous" ? (ar ? "السابقة: " : "Previous: ") : (ar ? "التالية: " : "Next: ")}{ar ? neighbor.object.name_ar : neighbor.object.name_en}</button></li>)}</ul></section>}
          <details className={`entity-panel-details ${researcherMode ? "is-researcher-details" : ""}`} open={researcherMode}>
            <summary>{researcherMode ? (ar ? "بيانات الباحث" : "Research details") : (ar ? "تفاصيل أكتر" : "More details")}</summary>
            <div className="entity-panel-research-content">
          {/* BATCH 14.1 — what the chosen year says about this entity, and which fact decided it.
              Placed above the generic facts so a reader does not mistake the stored status for the
              dated one while the timeline is active. */}
          {timeline && <TimelinePanelNote language={language} year={timeline.year} resolution={timeline.resolution}
            curatedStatus={entity.status} />}
          <Link className="entity-profile-link" href={`/${language}/entity/${encodeURIComponent(entity.code)}`}>{ar ? "فتح صفحة الكيان الكاملة ←" : "Open full entity page →"}</Link>
          {researcherMode && partialNote && <aside className="geometry-source-comparison" aria-label={ar ? "اكتمال الهندسة" : "Geometry completeness"}><strong>{ar ? "الهندسة جزئية" : "Partial geometry"}</strong><p>{partialNote}</p></aside>}
          {researcherMode && geometryAlternatives.length > 1 && <aside className="geometry-source-comparison"><strong>{entity.entity_type === "transit_line" ? (ar ? "مسارات مختلفة من المصدرين" : "Different routes from two sources") : (ar ? "حدود مختلفة من المصدرين" : "Different boundaries from two sources")}</strong><p>{ar ? "يعرض الأطلس المسارين كما وردا؛ لم يختر أحدهما بدلًا من الآخر." : "Both source routes are shown; neither is chosen as the winner."}</p><ul>{geometryAlternatives.map((item) => <li key={item.feature_code}><a href={`https://www.openstreetmap.org/${item.source_label.toLowerCase().includes("relation") ? "relation" : "way"}/${item.source_label.split(" ").at(-1)}`} target="_blank" rel="noreferrer">{item.source_label}</a> · {item.retrieval_date}</li>)}</ul></aside>}
          {researcherMode && entity.point_outside_boundary && <p className="point-outside-boundary-note" role="note">
            <CircleAlert aria-hidden="true" />
            {pointOutsideBoundaryNote({
              entity_code: entity.code,
              point: [0, 0],
              distance_outside_m: entity.point_outside_boundary.distance_outside_m,
              inside_osm_boundary: entity.point_outside_boundary.inside_osm_boundary,
              round_coordinate: entity.point_outside_boundary.round_coordinate,
            }, language)}
          </p>}
          {entity.has_boundary && <button className="boundary-toggle" type="button" aria-pressed={boundaryActive} onClick={() => onToggleBoundary(entity.code)} disabled={boundaryLoading}>
            <MapPinned aria-hidden="true" />{boundaryLoading
              ? (ar ? "جارٍ تحميل الحدود…" : "Loading boundary…")
              : entity.code === "CITY-CAIRO"
                ? boundaryActive ? (ar ? "إخفاء حدود محافظة القاهرة" : "Hide Cairo Governorate boundary") : (ar ? "إظهار حدود محافظة القاهرة" : "Show Cairo Governorate boundary")
                : boundaryActive ? (ar ? "إخفاء الحدود" : "Hide boundary") : (ar ? "إظهار الحدود على الخريطة" : "Show boundary on map")}
          </button>}
          {!entity.has_boundary && areaEntityTypes.has(entity.entity_type) && <p className="boundary-unavailable-note">{ar ? "الحدود غير متاحة في المصدر" : "Boundary unavailable in source"}</p>}
          {!entity.has_geometry && <p className="entity-unmapped-note"><MapPinOff aria-hidden="true" />{ar ? "لا توجد هندسة مسجلة لهذا الكيان" : "No geometry is recorded for this entity"}</p>}
          {entity.description && <p className="entity-description">{entity.description}</p>}
          {(entity.relations?.length ?? 0) > 0 && <section aria-labelledby="relations-heading" className="entity-relations-panel">
            <div className="panel-section-heading"><span className="section-index">01</span><div><h3 id="relations-heading">{ar ? "العلاقات" : "Relations"}</h3><small>{ar ? "روابط مسندة إلى سجل دليل" : "Evidence-backed entity links"}</small></div></div>
            <ul>{[...(entity.relations ?? [])].sort((a,b) => (a.ordinal ?? Number.MAX_SAFE_INTEGER) - (b.ordinal ?? Number.MAX_SAFE_INTEGER)).map((relation) => {
              const target = relation.subject_code === entity.code ? relation.object : relation.subject;
              const predicateLabels: Record<string, {ar:string;en:string}> = {has_station:{ar:"يضم محطة",en:"has station"},interchange_with:{ar:"تبادل مع",en:"interchanges with"},part_of:{ar:"جزء من",en:"part of"},crosses:{ar:"يعبر",en:"crosses"},connects:{ar:"يربط",en:"connects"},located_in:{ar:"يقع في",en:"located in"},operated_by:{ar:"تشغّله",en:"operated by"},developed_by:{ar:"تطوره",en:"developed by"}};
              return <li key={`${relation.subject_code}:${relation.predicate}:${relation.object_code}`}>
                {relation.ordinal && <span className="relation-ordinal">{relation.ordinal}</span>}<span>{predicateLabels[relation.predicate]?.[language] ?? relation.predicate}</span>
                <button className="relation-select-button" type="button" onClick={() => onSelectRelated(target.code)} title={ar ? "الانتقال إلى الكيان على الخريطة" : "Fly to this entity on the map"}>{ar ? target.name_ar : target.name_en}</button>
                {relation.predicate === "interchange_with" && <span className="transit-mode-pill">{ar ? "تبادل" : "Interchange"}</span>}
                {relation.evidence_ref && <Link className="relation-evidence-link" href={`/${language}/sources/${encodeURIComponent(relation.evidence_ref)}`} title={ar ? "فتح سجل الدليل" : "Open evidence record"}>{relation.evidence_ref}</Link>}
              </li>;
            })}</ul>
          </section>}
          {(entity.neighbors?.length ?? 0) > 0 && <section aria-labelledby="neighbors-heading" className="entity-relations-panel">
            <div className="panel-section-heading"><span className="section-index">02</span><div><h3 id="neighbors-heading">{ar ? "المحطات المجاورة" : "Neighboring stations"}</h3><small>{ar ? "حسب ترتيب المحطات الموثق" : "By documented station order"}</small></div></div>
            <ul>{entity.neighbors?.map((neighbor) => <li key={`${neighbor.subject_code}:${neighbor.object_code}`}>
              <span className="relation-ordinal">{neighbor.ordinal}</span><span>{neighbor.direction === "previous" ? (ar ? "سابقة" : "Previous") : (ar ? "تالية" : "Next")}</span>
              <button className="relation-select-button" type="button" onClick={() => onSelectRelated(neighbor.object_code)}>{ar ? neighbor.object.name_ar : neighbor.object.name_en}</button>
            </li>)}</ul>
          </section>}
          <section aria-labelledby="facts-heading">
            <div className="panel-section-heading"><span className="section-index">{(entity.relations?.length ?? 0) > 0 ? ((entity.neighbors?.length ?? 0) > 0 ? "03" : "02") : "01"}</span><div><h3 id="facts-heading">{ar ? "الحقائق والمصادر" : "Facts & evidence"}</h3><small>{ar ? "التعارضات معروضة جنبًا إلى جنب دون ترجيح آلي" : "Conflicting claims stay side by side; no automatic winner."}</small></div></div>
            {groups.length ? groups.map(([attribute, facts]) => <div className="fact-group" key={attribute}>
              <h4 title={attribute}>{translateLabel(FACT_ATTRIBUTE_LABELS, attribute, language)}{facts.length > 1 && <span>{ar ? `${facts.length} قيم متعارضة/متعددة` : `${facts.length} claims`}</span>}</h4>
              <div className={facts.length > 1 ? "fact-grid conflicting-facts" : "fact-grid"}>{facts.map((fact) => <FactCard key={fact.code} fact={fact} language={language} />)}</div>
            </div>) : <p className="panel-state">{ar ? "لا توجد حقائق مسجلة لهذا الكيان." : "No facts are recorded for this entity."}</p>}
          </section>
          <EntityTimeline facts={entity.facts} language={language}/>
            </div>
          </details>
        </>}
      </div>
      {researcherMode && <footer className="entity-panel-footer">{ar ? "المصادر كما سُجلت؛ لا يُعد المصدر الثانوي وحده إثباتًا." : "Sources are shown as recorded; a secondary source alone is not proof."}</footer>}
    </aside>
  </>;
}
