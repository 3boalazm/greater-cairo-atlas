import type { Metadata } from "next";
import Link from "next/link";
import AtlasApp from "@/components/atlas/AtlasApp";
import { getSiteUrl, resolveLanguage } from "@/components/site/SiteChrome";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }): Promise<Metadata> {
  const language = resolveLanguage((await searchParams).lang);
  const canonical = getSiteUrl();
  return {
    title: language === "ar" ? "أطلس القاهرة الكبرى" : "Greater Cairo Atlas",
    description: language === "ar"
      ? "أطلس جغرافي موثق للقاهرة الكبرى، يحفظ مصادر الحقائق ويعرض التعارضات دون استنتاج الهندسة أو الحالة."
      : "A source-backed geospatial atlas of Greater Cairo that preserves provenance and conflicting claims without inferring geometry or status.",
    alternates: { canonical, languages: { ar: canonical, en: `${canonical}?lang=en` } },
  };
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const language = resolveLanguage((await searchParams).lang);
  const ar = language === "ar";
  const dataset = await getStaticAtlasDataset();
  const uniqueEntities = [...new Map(dataset.entities.map((entity) => [entity.code, entity])).values()];
  const entities = [...uniqueEntities].sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")).slice(0, 12);
  return <>
    <AtlasApp />
    <section className="site-content" aria-labelledby="atlas-intro-title">
      <p className="site-eyebrow">{ar ? "أطلس موثّق للقاهرة الكبرى" : "DOCUMENTED ATLAS OF GREATER CAIRO"}</p>
      <h1 id="atlas-intro-title">{ar ? "بيانات موثوقة عن المكان ومصادرها" : "Greater Cairo, documented with sources"}</h1>
      <p className="site-lede">{ar ? "استكشف أطلسًا جغرافيًا موثقًا؛ تُعرض الحقائق المتعارضة مع مصادرها، ولا تُستنتج حالة التشغيل أو الهندسة." : "Explore a source-backed geospatial atlas. Conflicting facts remain visible with their sources; operational status and geometry are never inferred."}</p>
      <p>{ar ? `يتضمن الإصدار الحالي ${dataset.entities.length.toLocaleString("ar-EG")} كيانًا، و${dataset.facts.length.toLocaleString("ar-EG")} حقيقة، و${dataset.evidence.length.toLocaleString("ar-EG")} مصدرًا، و${dataset.features.length.toLocaleString("ar-EG")} ميزة هندسية.` : `The current dataset contains ${dataset.entities.length.toLocaleString()} entities, ${dataset.facts.length.toLocaleString()} facts, ${dataset.evidence.length.toLocaleString()} sources, and ${dataset.features.length.toLocaleString()} geometry features.`}</p>
      <h2>{ar ? "استكشف كيانات الأطلس" : "Explore atlas entities"}</h2>
      <ul>{entities.map((entity) => <li key={entity.code}><Link href={`/entity/${encodeURIComponent(entity.code)}?lang=${language}`}>{entity.name_ar} <span aria-label={ar ? "نوع الكيان" : "entity type"}>— {entity.entity_type}</span></Link></li>)}</ul>
      <p><Link href={`/data?lang=${language}`}>{ar ? "تنزيل البيانات ومراجعة الإسناد والترخيص ←" : "Download data and review attribution and licensing →"}</Link></p>
    </section>
  </>;
}
