"use client";
/* eslint-disable react-hooks/set-state-in-effect -- clear stale async results when the query becomes empty. */

import { ArrowDown, MapPinned, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AtlasEntitySummary, AtlasLanguage } from "./atlas-client";
import { ENTITY_TYPE_LABELS, SIMPLE_STATUS_LABELS, stationDisplayName, translateLabel } from "@/lib/atlas/labels";
import { disambiguationNote, entityListLabel, groupByRegionalScope, isRegionalLink, regionalLinkLabel } from "@/lib/atlas/entity-presentation";
import { useResearchMode } from "@/components/site/ResearchMode";

export function SearchCommand({ language, onSelect, onShowBoundary }: { language: AtlasLanguage; onSelect: (code: string) => void; onShowBoundary: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AtlasEntitySummary[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl K");
  const inputRef = useRef<HTMLInputElement>(null);
  const ar = language === "ar";
  const researcherMode = useResearchMode().researcherMode;

  useEffect(() => {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    setShortcutLabel(isMac ? "⌘ K" : "Ctrl K");
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/atlas/entities?q=${encodeURIComponent(query)}&limit=12`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("search failed");
          return response.json() as Promise<{ entities: AtlasEntitySummary[] }>;
        })
        .then((payload) => { setResults(payload.entities); setActive(0); })
        .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setResults([]); })
        .finally(() => setLoading(false));
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const choose = (entity: AtlasEntitySummary) => { onSelect(entity.code); setOpen(false); setQuery(""); inputRef.current?.blur(); };

  /**
   * BATCH 12.3 — every row renders name + type (or mode/line for stations), so two different entities
   * with the same name can never show the same visible label. A shared alias adds one short line.
   */
  const rows = results.map((entity) => {
    const names = [entity.name_ar, entity.name_en, ...(entity.aliases ?? [])];
    return { entity, label: entityListLabel(entity, language), names };
  });
  const disambiguationRows = rows.map((row) => ({
    code: row.entity.code, displayLabel: row.label, names: row.names,
  }));
  // BATCH 12.2 — regional links are grouped after the Greater Cairo matches.
  const { local: localRows, regional: regionalRows } = groupByRegionalScope(rows, (row) => row.entity.sector);
  return <div className="atlas-search">
    <Search className="search-leading" aria-hidden="true" />
    <input ref={inputRef} value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
        if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setActive((value) => (value + 1) % results.length); }
        if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setActive((value) => (value - 1 + results.length) % results.length); }
        if (event.key === "Enter" && results[active]) { event.preventDefault(); choose(results[active]); }
      }}
      role="combobox" aria-expanded={open && Boolean(query)} aria-controls="atlas-search-results" aria-autocomplete="list"
      aria-label={ar ? "ابحث عن كيان" : "Search entities"}
      placeholder={ar ? "ابحث عن طريق أو محطة أو مدينة…" : "Search roads, transit, cities…"} />
    {loading && <span className="search-loading" role="status">{ar ? "بحث…" : "Searching…"}</span>}
    {!loading && query && <button className="search-clear" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label={ar ? "مسح البحث" : "Clear search"}><X aria-hidden="true" /></button>}
    <kbd aria-label={shortcutLabel}>{shortcutLabel}</kbd>
    {open && query.trim() && <>
      <button className="search-dismiss" tabIndex={-1} aria-label={ar ? "إغلاق البحث" : "Close search"} onClick={() => setOpen(false)} />
      <div className="search-results" id="atlas-search-results" role="listbox" aria-label={ar ? "نتائج البحث" : "Search results"}>
        {[...localRows, ...regionalRows].map(({ entity, label, names }, index) => {
          const note = disambiguationNote({ code: entity.code, displayLabel: label, names }, disambiguationRows, language);
          return <div key={entity.code} role="option" aria-selected={index === active} className={`search-result-row ${index === active ? "active-result" : ""}`} onMouseEnter={() => setActive(index)}>
          <button className="search-result-select" type="button" onClick={() => choose(entity)}>
            <span className="result-main"><strong>{label}</strong><small>{researcherMode ? <>{ar ? entity.name_en : entity.name_ar} · {entity.code}</> : <>{translateLabel(ENTITY_TYPE_LABELS, entity.entity_type, language)} · {translateLabel(SIMPLE_STATUS_LABELS, entity.status, language)}</>}</small>
              {note && <small className="result-disambiguation">{note}</small>}
              {isRegionalLink(entity) && <small className="result-regional">{regionalLinkLabel(language)}</small>}</span>
            {researcherMode && !entity.has_geometry && <span className="no-geometry-result">{ar ? "لا توجد هندسة" : "No geometry"}</span>}
            <ArrowDown className="result-enter" aria-hidden="true" />
          </button>
          {entity.has_boundary && <button type="button" className="search-boundary-action" onClick={() => {
            onShowBoundary(entity.code); setOpen(false); setQuery(""); inputRef.current?.blur();
          }} aria-label={ar
            ? entity.code === "CITY-CAIRO" ? "إظهار حدود محافظة القاهرة على الخريطة" : `إظهار حدود ${stationDisplayName(entity.code, entity.name_ar)} على الخريطة`
            : entity.code === "CITY-CAIRO" ? "Show Cairo Governorate boundary on map" : `Show ${entity.name_en} boundary on map`}>
            <MapPinned aria-hidden="true" />{ar ? entity.code === "CITY-CAIRO" ? "حدود محافظة القاهرة" : "إظهار الحدود" : "Show boundary"}
          </button>}
        </div>;})}
        {!loading && results.length === 0 && <p role="status">{ar ? "لا توجد نتائج مطابقة." : "No matching entities."}</p>}
        <footer><span>{ar ? "للتنقل" : "Navigate"} <kbd>↑</kbd><kbd>↓</kbd></span><span>{ar ? "للفتح" : "Open"} <kbd>↵</kbd></span></footer>
      </div>
    </>}
  </div>;
}
