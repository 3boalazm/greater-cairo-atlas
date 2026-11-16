"use client";
/* eslint-disable react-hooks/set-state-in-effect -- platform shortcut is detected after hydration. */

import { ArrowDown, MapPinned, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AtlasEntitySummary, AtlasLanguage } from "./atlas-client";
import { ENTITY_TYPE_LABELS, SIMPLE_STATUS_LABELS, stationDisplayName, translateLabel } from "@/lib/atlas/labels";
import { disambiguationNote, entityListLabel, isRegionalLink, regionalLinkLabel } from "@/lib/atlas/entity-presentation";
import { readRecent, searchEntities, searchGroup, SEARCH_GROUPS, suggestedEntities } from "@/lib/atlas/search";
import { useResearchMode } from "@/components/site/ResearchMode";

export function SearchCommand({ language, entities, onSelect, onShowBoundary }: { language: AtlasLanguage; entities: AtlasEntitySummary[]; onSelect: (code: string) => void; onShowBoundary: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl K");
  const inputRef = useRef<HTMLInputElement>(null);
  const ar = language === "ar";
  const researcherMode = useResearchMode().researcherMode;
  const refreshRecent = () => { try { setRecent(readRecent(window.localStorage)); } catch { setRecent([]); } };
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    setShortcutLabel(isMac ? "⌘ K" : "Ctrl K");
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setOpen(true); refreshRecent(); requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const results = useMemo(() => query.trim() ? searchEntities(entities, query) : suggestedEntities(entities, recent), [entities, query, recent]);
  const grouped = SEARCH_GROUPS.map((group) => ({ ...group, items: results.filter((entity) => searchGroup(entity.entity_type) === group.key) })).filter((group) => group.items.length);
  const ordered = grouped.flatMap((group) => group.items);
  const rows = ordered.map((entity) => ({ entity, label: entityListLabel(entity, language), names: [entity.name_ar, entity.name_en, ...(entity.aliases ?? [])] }));
  const disambiguationRows = rows.map((row) => ({ code: row.entity.code, displayLabel: row.label, names: row.names }));
  const choose = (entity: AtlasEntitySummary) => { onSelect(entity.code); setOpen(false); setQuery(""); inputRef.current?.blur(); };
  return <div className="atlas-search">
    <button type="button" className="search-focus-button" aria-label={ar ? "بحث في الأطلس" : "Search atlas"} onClick={() => { setOpen(true); refreshRecent(); inputRef.current?.focus(); }}><Search className="search-leading" aria-hidden="true" /></button>
    <input ref={inputRef} value={query} onFocus={() => { setOpen(true); refreshRecent(); }} onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
        if (event.key === "ArrowDown" && ordered.length) { event.preventDefault(); setActive((value) => (value + 1) % ordered.length); }
        if (event.key === "ArrowUp" && ordered.length) { event.preventDefault(); setActive((value) => (value - 1 + ordered.length) % ordered.length); }
        if (event.key === "Enter" && ordered[active]) { event.preventDefault(); choose(ordered[active]); }
      }}
      role="combobox" aria-expanded={open} aria-controls="atlas-search-results" aria-autocomplete="list"
      aria-label={ar ? "ابحث عن كيان" : "Search entities"} placeholder={ar ? "ابحث في الأطلس…" : "Search the atlas…"} />
    {query && <button className="search-clear" onClick={() => { setQuery(""); setActive(0); inputRef.current?.focus(); }} aria-label={ar ? "مسح البحث" : "Clear search"}><X aria-hidden="true" /></button>}
    <kbd className="search-shortcut" aria-label={shortcutLabel}>{shortcutLabel}</kbd>
    {open && <>
      <button className="search-dismiss" tabIndex={-1} aria-label={ar ? "إغلاق البحث" : "Close search"} onClick={() => setOpen(false)} />
      <div className="search-results" id="atlas-search-results" role="listbox" aria-label={ar ? "نتائج البحث" : "Search results"}>
        {!query.trim() && <p className="search-suggestions-label">{ar ? "المشاهدة مؤخرًا والخطوط والمحطات الرئيسية" : "Recently viewed, main lines and interchanges"}</p>}
        {grouped.map((group) => <div key={group.key} role="group" aria-label={group[language]}><h3 className="search-group-heading">{group[language]}</h3>{group.items.map((entity) => {
          const index = ordered.indexOf(entity);
          const label = entityListLabel(entity, language);
          const names = [entity.name_ar, entity.name_en, ...(entity.aliases ?? [])];
          const note = disambiguationNote({ code: entity.code, displayLabel: label, names }, disambiguationRows, language);
          return <div key={entity.code} role="option" aria-selected={index === active} className={`search-result-row ${index === active ? "active-result" : ""}`} onMouseEnter={() => setActive(index)}>
            <button className="search-result-select" type="button" onClick={() => choose(entity)}>
              <span className="result-main"><strong>{label}</strong><small><span className="search-type-chip">{translateLabel(ENTITY_TYPE_LABELS, entity.entity_type, language)}</span> <span className="search-status-chip">{translateLabel(SIMPLE_STATUS_LABELS, entity.status, language)}</span>{researcherMode && <> · {entity.code}</>}</small>
                {note && <small className="result-disambiguation">{note}</small>}{isRegionalLink(entity) && <small className="result-regional">{regionalLinkLabel(language)}</small>}</span>
              {researcherMode && !entity.has_geometry && <span className="no-geometry-result">{ar ? "لا توجد هندسة" : "No geometry"}</span>}
              <ArrowDown className="result-enter" aria-hidden="true" />
            </button>
            {entity.has_boundary && <button type="button" className="search-boundary-action" onClick={() => { onShowBoundary(entity.code); setOpen(false); setQuery(""); inputRef.current?.blur(); }} aria-label={ar ? `إظهار حدود ${stationDisplayName(entity.code, entity.name_ar)} على الخريطة` : `Show ${entity.name_en} boundary on map`}><MapPinned aria-hidden="true" />{ar ? "إظهار الحدود" : "Show boundary"}</button>}
          </div>;
        })}</div>)}
        {!ordered.length && <p role="status">{ar ? "لا توجد نتائج مطابقة." : "No matching entities."}</p>}
        <footer><span>{ar ? "للتنقل" : "Navigate"} <kbd>↑</kbd><kbd>↓</kbd></span><span>{ar ? "للفتح" : "Open"} <kbd>↵</kbd></span></footer>
      </div>
    </>}
  </div>;
}
