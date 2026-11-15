import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader, getSiteUrl, localizedPath, resolveLanguage } from "@/components/site/SiteChrome";
import { SourcesCatalog } from "@/components/atlas/SourcesCatalog";
import { getStaticEvidenceCatalog } from "@/lib/atlas/static-dataset";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }): Promise<Metadata> {
  const language = resolveLanguage((await searchParams).lang);
  const canonical = `${getSiteUrl()}${localizedPath(language, "/sources")}`;
  return { title: language === "ar" ? "سجل الأدلة | أطلس القاهرة الكبرى" : "Evidence registry | Greater Cairo Atlas",
    description: "Searchable evidence records supporting Greater Cairo Atlas facts.", alternates: { canonical, languages: { ar: `${getSiteUrl()}/ar/sources`, en: `${getSiteUrl()}/en/sources` } } };
}

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const language = resolveLanguage((await searchParams).lang);
  const ar = language === "ar";
  const records = await getStaticEvidenceCatalog();
  return <div className="site-layout" lang={language} dir={ar ? "rtl" : "ltr"}><SiteHeader language={language}/><main className="site-content document-page" id="main-content">
    <p className="site-eyebrow">{ar ? "دليل الإسناد" : "CITATION DIRECTORY"}</p><h1>{ar ? "سجل الأدلة" : "Evidence registry"}</h1>
    <p className="site-lede">{ar ? "ابحث في سجلات الأدلة المرتبطة بالحقائق، وصفِّها حسب النوع والناشر والرابط وسنة النشر." : "Search evidence records linked to atlas facts, and filter by source type, publisher, URL availability, and publication year."}</p>
    <div className="source-index-summary"><strong>{records.length.toLocaleString()}</strong><span>{ar ? "سجل دليل" : "evidence records"}</span></div>
    <SourcesCatalog records={records} language={language}/>
    <section className="license-block"><h2>{ar ? "إسناد البيانات والترخيص" : "Data attribution & licensing"}</h2><p><strong>{ar ? "حقائق البحث والأدلة والبيانات غير المشتقة من OSM:" : "Research facts, evidence, and non-OSM data:"}</strong> © Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0.</p><p><strong>{ar ? "الهندسة المشتقة من OpenStreetMap:" : "OpenStreetMap-derived geometry:"}</strong> © OpenStreetMap contributors, ODbL 1.0.</p></section>
    <p className="site-backlink"><Link href={`/${language}/methodology`}>{ar ? "اقرأ المنهجية وسياسة التحقق ←" : "Read the methodology and verification policy →"}</Link></p>
  </main><SiteFooter language={language}/></div>;
}
