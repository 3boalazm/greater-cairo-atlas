import { formatFactValue } from "@/lib/atlas/units";
import { FACT_ATTRIBUTE_LABELS } from "@/lib/atlas/fact-attribute-labels";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader, getSiteUrl, localizedPath, resolveLanguage } from "@/components/site/SiteChrome";
import { getStaticEvidenceDetail } from "@/lib/atlas/static-dataset";
import { SOURCE_TYPE_LABELS, VERIFICATION_LABELS, translateLabel } from "@/lib/atlas/labels";

export async function generateStaticParams() {
  const { getStaticEvidenceCatalog } = await import("@/lib/atlas/static-dataset");
  return (await getStaticEvidenceCatalog()).map((item) => ({ code: item.code }));
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ lang?: string | string[] }> }): Promise<Metadata> {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const language = resolveLanguage(query.lang);
  const detail = await getStaticEvidenceDetail(code);
  if (!detail) return { title: language === "ar" ? "الدليل غير موجود" : "Evidence not found", robots: { index: false, follow: false } };
  const canonical = `${getSiteUrl()}${localizedPath(language, `/sources/${encodeURIComponent(code)}`)}`;
  return { title: `${detail.evidence.title} | ${language === "ar" ? "سجل الأدلة" : "Evidence registry"}`,
    description: detail.evidence.title, alternates: { canonical, languages: { ar: `${getSiteUrl()}/ar/sources/${encodeURIComponent(code)}`, en: `${getSiteUrl()}/en/sources/${encodeURIComponent(code)}` } } };
}

export default async function EvidenceDetailPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ lang?: string | string[] }> }) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const language = resolveLanguage(query.lang);
  const ar = language === "ar";
  const detail = await getStaticEvidenceDetail(code);
  if (!detail) notFound();
  const source = detail.evidence;
  const date = source.published_date ? source.published_date.slice(0, source.published_date_precision === "day" ? 10 : source.published_date_precision === "month" ? 7 : 4) : "—";
  return <div className="site-layout" lang={language} dir={ar ? "rtl" : "ltr"}><SiteHeader language={language}/><main className="site-content document-page evidence-detail-page" id="main-content">
    <nav className="breadcrumbs"><Link href={`/${language}/sources`}>{ar ? "سجل الأدلة" : "Evidence registry"}</Link><span aria-hidden="true">/</span><code>{source.code}</code></nav>
    <p className="site-eyebrow">{translateLabel(SOURCE_TYPE_LABELS, source.source_type, language)}</p><h1>{source.title}</h1>
    <p className="site-lede">{source.publisher}</p>
    <dl className="evidence-detail-facts"><div><dt>{ar ? "الرمز" : "Code"}</dt><dd><code>{source.code}</code></dd></div><div><dt>{ar ? "نوع المصدر" : "Source type"}</dt><dd>{translateLabel(SOURCE_TYPE_LABELS, source.source_type, language)}</dd></div>
      <div><dt>{ar ? "تاريخ النشر" : "Published"}</dt><dd>{date}{source.published_date_precision !== "day" ? ` · ${ar ? (source.published_date_precision === "month" ? "دقة شهر" : "دقة سنة") : `${source.published_date_precision} precision`}` : ""}</dd></div>
      <div><dt>{ar ? "تاريخ الاطلاع" : "Accessed"}</dt><dd>{source.accessed_date ?? "—"}</dd></div><div><dt>{ar ? "الحقائق المرتبطة" : "Linked facts"}</dt><dd>{source.linked_facts_count}</dd></div>
      <div><dt>{ar ? "الكيانات المرتبطة" : "Linked entities"}</dt><dd>{source.linked_entities_count}</dd></div></dl>
    {source.url ? <p><a className="evidence-record-url" href={source.url} target="_blank" rel="noreferrer">{source.url}</a></p> : <p className="quiet-note">{ar ? "بدون رابط" : "No URL"}</p>}
    {source.notes && <section className="license-block"><h2>{ar ? "ملاحظات الدليل" : "Evidence notes"}</h2><p>{source.notes}</p></section>}
    <section className="entity-section"><div className="section-title"><span>01</span><div><h2>{ar ? "الحقائق المدعومة" : "Supported facts"}</h2><p>{ar ? "تُعرض حالة التحقق كما سُجلت، بما في ذلك الادعاءات المتنازع عليها أو المستبدلة." : "Verification states are shown as recorded, including disputed and superseded claims."}</p></div></div>
      {detail.facts.length ? <div className="entity-fact-groups">{detail.facts.map((fact) => <article className="entity-claim" key={fact.code}>
        <h3><Link href={`/${language}/entity/${encodeURIComponent(fact.entity_code)}`}>{ar ? fact.entity_name_ar : fact.entity_name_en}</Link></h3><p>{translateLabel(FACT_ATTRIBUTE_LABELS, fact.attribute, language)}</p><strong>{formatFactValue(fact.value, fact.unit, language)}</strong>
        <p><span className={`verification-badge verification-${fact.verification_state}`}>{translateLabel(VERIFICATION_LABELS, fact.verification_state, language)}</span>
          {fact.is_contradicted && <span className="verification-badge verification-disputed">{ar ? "قيمة متعارضة" : "Contradicted claim"}</span>}
          {fact.verification_state === "superseded" && <span className="verification-badge">{ar ? "مستبدل" : "Superseded"}</span>}</p>
        {fact.valid_as_of && <small>{ar ? "صالح بتاريخ" : "Valid as of"} {fact.valid_as_of.slice(0, fact.valid_as_of_precision === "day" ? 10 : fact.valid_as_of_precision === "month" ? 7 : 4)} · {fact.valid_as_of_precision}</small>}
        {fact.notes && <p>{fact.notes}</p>}
      </article>)}</div> : <p className="quiet-note">{ar ? "لا توجد حقائق مرتبطة بهذا السجل." : "No facts are linked to this record."}</p>}
    </section>
    <p className="site-backlink"><Link href={`/${language}/sources`}>{ar ? "← العودة إلى سجل الأدلة" : "← Back to evidence registry"}</Link></p>
  </main><SiteFooter language={language}/></div>;
}
