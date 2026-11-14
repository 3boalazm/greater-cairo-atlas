import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader, getSiteUrl, resolveLanguage } from "@/components/site/SiteChrome";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";
import { ENTITY_TYPE_LABELS, SECTOR_LABELS, STATUS_LABELS, stationDisplayName, translateLabel } from "@/lib/atlas/labels";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }): Promise<Metadata> {
  const language = resolveLanguage((await searchParams).lang);
  const canonical = `${getSiteUrl()}/directory`;
  return {
    title: language === "ar" ? "دليل كيانات الأطلس" : "Atlas entity directory",
    description: language === "ar" ? "دليل قابل للفهرسة لكيانات أطلس القاهرة الكبرى." : "A crawlable directory of Greater Cairo Atlas entities.",
    alternates: { canonical, languages: { ar: canonical, en: `${canonical}?lang=en` } },
  };
}

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const language = resolveLanguage((await searchParams).lang);
  const ar = language === "ar";
  const dataset = await getStaticAtlasDataset();
  const entities = [...dataset.entities].sort((a, b) => a.sector.localeCompare(b.sector) || a.name_ar.localeCompare(b.name_ar, "ar"));
  return <div className="site-layout" lang={language} dir={ar ? "rtl" : "ltr"}>
    <SiteHeader language={language} />
    <main className="site-content document-page directory-page" id="main-content">
      <p className="site-eyebrow">{ar ? "دليل الأطلس" : "ATLAS DIRECTORY"}</p>
      <h1>{ar ? "كيانات القاهرة الكبرى" : "Greater Cairo entities"}</h1>
      <p className="site-lede">{ar ? "قائمة كاملة قابلة للفهرسة. أسماء الكيانات كما في السجل؛ لا تُخمن الترجمات أو الحالة أو الهندسة." : "A crawlable index of every atlas entity. Names follow the register; translations, status, and geometry are not guessed."}</p>
      <p>{entities.length.toLocaleString(ar ? "ar-EG" : "en-US")} {ar ? "كيانًا" : "entities"}</p>
      <div className="directory-list">{entities.map((entity) => <article className="directory-item" key={entity.code}>
        <div><h2><Link href={`/entity/${encodeURIComponent(entity.code)}?lang=${language}`}>{stationDisplayName(entity.code, ar ? entity.name_ar : entity.name_en)}</Link></h2>
          <p>{ar ? entity.name_en : entity.name_ar} · <code>{entity.code}</code></p></div>
        <div className="directory-meta"><span>{translateLabel(ENTITY_TYPE_LABELS, entity.entity_type, language)} <small title={entity.entity_type}>({entity.entity_type})</small></span>
          <span>{translateLabel(SECTOR_LABELS, entity.sector, language)} <small title={entity.sector}>({entity.sector})</small></span>
          <span className={`status-pill status-${entity.status}`}>{translateLabel(STATUS_LABELS, entity.status, language)} <small title={entity.status}>({entity.status})</small></span></div>
      </article>)}</div>
    </main>
    <SiteFooter language={language} />
  </div>;
}
