"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { StaticEvidenceCatalogItem } from "@/lib/atlas/static-dataset";

const types = ["official", "news", "dataset", "map", "pdf", "secondary"] as const;
const typeLabel: Record<string, { ar: string; en: string }> = {
  official: { ar: "رسمي", en: "Official" }, news: { ar: "إخباري", en: "News" }, dataset: { ar: "مجموعة بيانات", en: "Dataset" },
  map: { ar: "خرائط", en: "Map" }, pdf: { ar: "ملف PDF", en: "PDF" }, secondary: { ar: "ثانوي", en: "Secondary" },
};
const dateString = (source: StaticEvidenceCatalogItem) => source.published_date ? source.published_date.slice(0, source.published_date_precision === "day" ? 10 : source.published_date_precision === "month" ? 7 : 4) : "—";

export function SourcesCatalog({ records, language }: { records: StaticEvidenceCatalogItem[]; language: "ar" | "en" }) {
  const ar = language === "ar";
  const [query, setQuery] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [publisher, setPublisher] = useState("");
  const [url, setUrl] = useState("");
  const [year, setYear] = useState("");
  const [sort, setSort] = useState("date-desc");
  const publishers = useMemo(() => [...new Set(records.map((r) => r.publisher).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [records]);
  const years = useMemo(() => [...new Set(records.flatMap((r) => r.published_date ? [r.published_date.slice(0, 4)] : []))].sort().reverse(), [records]);
  const filtered = useMemo(() => records.filter((r) => {
    const q = query.trim().toLocaleLowerCase();
    return (!q || [r.title, r.publisher, r.code].some((value) => value?.toLocaleLowerCase().includes(q))) &&
      (!sourceType || r.source_type === sourceType) && (!publisher || r.publisher === publisher) &&
      (!url || (url === "yes" ? Boolean(r.url) : !r.url)) && (!year || r.published_date?.startsWith(year));
  }).sort((a, b) => sort === "facts-desc" ? b.linked_facts_count - a.linked_facts_count || a.code.localeCompare(b.code) :
    sort === "facts-asc" ? a.linked_facts_count - b.linked_facts_count || a.code.localeCompare(b.code) :
    (b.published_date ?? "").localeCompare(a.published_date ?? "") * (sort === "date-asc" ? -1 : 1) || a.code.localeCompare(b.code)), [records, query, sourceType, publisher, url, year, sort]);
  const selectLabel = (value: string, placeholder: string) => <option value="">{placeholder}</option>;
  return <>
    <form className="sources-filters" onSubmit={(event) => event.preventDefault()} aria-label={ar ? "تصفية سجل الأدلة" : "Filter evidence records"}>
      <label><span>{ar ? "بحث" : "Search"}</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ar ? "العنوان أو الناشر أو الرمز" : "Title, publisher, or code"} /></label>
      <label><span>{ar ? "نوع المصدر" : "Source type"}</span><select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>{selectLabel("", ar ? "كل الأنواع" : "All types")}{types.map((type) => <option key={type} value={type}>{typeLabel[type]?.[language] ?? type}</option>)}</select></label>
      <label><span>{ar ? "الناشر" : "Publisher"}</span><select value={publisher} onChange={(e) => setPublisher(e.target.value)}>{selectLabel("", ar ? "كل الناشرين" : "All publishers")}{publishers.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label><span>{ar ? "الرابط" : "URL"}</span><select value={url} onChange={(e) => setUrl(e.target.value)}>{selectLabel("", ar ? "الكل" : "Any") }<option value="yes">{ar ? "له رابط" : "Has URL"}</option><option value="no">{ar ? "بدون رابط" : "No URL"}</option></select></label>
      <label><span>{ar ? "سنة النشر" : "Publication year"}</span><select value={year} onChange={(e) => setYear(e.target.value)}>{selectLabel("", ar ? "كل السنوات" : "All years")}{years.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>{ar ? "ترتيب" : "Sort"}</span><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="date-desc">{ar ? "الأحدث تاريخًا" : "Date, newest"}</option><option value="date-asc">{ar ? "الأقدم تاريخًا" : "Date, oldest"}</option><option value="facts-desc">{ar ? "الأكثر حقائق مرتبطة" : "Most linked facts"}</option><option value="facts-asc">{ar ? "الأقل حقائق مرتبطة" : "Fewest linked facts"}</option></select></label>
    </form>
    <p className="sources-result-count" aria-live="polite">{filtered.length.toLocaleString()} {ar ? "سجلًا" : "records"}</p>
    <div className="evidence-record-list">{filtered.map((record) => <article className="evidence-record-card" key={record.code}>
      <div className="evidence-record-heading"><div><span className="source-type-pill">{typeLabel[record.source_type]?.[language] ?? record.source_type}</span><h2><Link href={`/sources/${encodeURIComponent(record.code)}?lang=${language}`}>{record.title}</Link></h2></div><code>{record.code}</code></div>
      <p className="evidence-record-publisher">{record.publisher}</p>
      <dl><div><dt>{ar ? "تاريخ النشر" : "Published"}</dt><dd>{dateString(record)} {record.published_date && record.published_date_precision !== "day" ? `· ${ar ? ({month:"شهر",year:"سنة"} as const)[record.published_date_precision] : record.published_date_precision}` : ""}</dd></div>
        <div><dt>{ar ? "تاريخ الاطلاع" : "Accessed"}</dt><dd>{record.accessed_date ?? "—"}</dd></div>
        <div><dt>{ar ? "الحقائق المرتبطة" : "Linked facts"}</dt><dd>{record.linked_facts_count}</dd></div><div><dt>{ar ? "الكيانات" : "Entities"}</dt><dd>{record.linked_entities_count}</dd></div></dl>
      {record.url ? <a className="evidence-record-url" href={record.url} target="_blank" rel="noreferrer">{record.url}</a> : <p className="quiet-note">{ar ? "بدون رابط" : "No URL"}</p>}
    </article>)}</div>
    {!filtered.length && <p className="quiet-note">{ar ? "لا توجد سجلات تطابق عوامل التصفية." : "No evidence records match these filters."}</p>}
  </>;
}
