"use client";
/* eslint-disable react-hooks/set-state-in-effect -- clear stale async results when the query becomes empty. */

import { ArrowDown, Command, MapPinned, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AtlasEntitySummary, AtlasLanguage } from "./atlas-client";

export function SearchCommand({ language, onSelect, onShowBoundary }: { language: AtlasLanguage; onSelect: (code: string) => void; onShowBoundary: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AtlasEntitySummary[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ar = language === "ar";

  useEffect(() => {
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
    <kbd><Command aria-hidden="true" /> K</kbd>
    {open && query.trim() && <>
      <button className="search-dismiss" tabIndex={-1} aria-label={ar ? "إغلاق البحث" : "Close search"} onClick={() => setOpen(false)} />
      <div className="search-results" id="atlas-search-results" role="listbox" aria-label={ar ? "نتائج البحث" : "Search results"}>
        {results.map((entity, index) => <div key={entity.code} role="option" aria-selected={index === active} className={`search-result-row ${index === active ? "active-result" : ""}`} onMouseEnter={() => setActive(index)}>
          <button className="search-result-select" type="button" onClick={() => choose(entity)}>
            <span className="result-main"><strong>{ar ? entity.name_ar : entity.name_en}</strong><small>{ar ? entity.name_en : entity.name_ar} · {entity.code}</small></span>
            {!entity.has_geometry && <span className="no-geometry-result">{ar ? "لا توجد هندسة" : "No geometry"}</span>}
            <ArrowDown className="result-enter" aria-hidden="true" />
          </button>
          {entity.has_boundary && <button type="button" className="search-boundary-action" onClick={() => {
            onShowBoundary(entity.code); setOpen(false); setQuery(""); inputRef.current?.blur();
          }} aria-label={ar ? `إظهار حدود ${entity.name_ar} على الخريطة` : `Show ${entity.name_en} boundary on map`}>
            <MapPinned aria-hidden="true" />{ar ? "إظهار الحدود" : "Show boundary"}
          </button>}
        </div>)}
        {!loading && results.length === 0 && <p role="status">{ar ? "لا توجد نتائج مطابقة." : "No matching entities."}</p>}
        <footer><span>{ar ? "للتنقل" : "Navigate"} <kbd>↑</kbd><kbd>↓</kbd></span><span>{ar ? "للفتح" : "Open"} <kbd>↵</kbd></span></footer>
      </div>
    </>}
  </div>;
}
