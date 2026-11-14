import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader, resolveLanguage } from "@/components/site/SiteChrome";
import { getExportMetadata } from "@/lib/atlas/static-dataset";

export const metadata: Metadata = { title: "Data exports | Greater Cairo Atlas", description: "Download the Greater Cairo Atlas data as CSV, JSON, and GeoJSON, with provenance, version, and licensing notes." };

export default async function DataPage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const language=resolveLanguage((await searchParams).lang);
  const ar=language==="ar";
  const metadata=await getExportMetadata();
  const links=[
    {name:ar?"الكيانات · CSV":"Entities · CSV",url:"/api/exports/csv?table=entities",count:metadata.counts.entities},
    {name:ar?"الحقائق · CSV":"Facts · CSV",url:"/api/exports/csv?table=facts",count:metadata.counts.facts},
    {name:ar?"الأدلة · CSV":"Evidence · CSV",url:"/api/exports/csv?table=evidence",count:metadata.counts.evidence},
    {name:ar?"روابط الحقيقة–الدليل · CSV":"Fact–evidence links · CSV",url:"/api/exports/csv?table=fact_evidence",count:metadata.counts.fact_evidence},
    {name:ar?"مجموعة الأطلس كاملة · JSON":"Full atlas bundle · JSON",url:"/api/exports/json",count:null},
    {name:ar?"الهندسة مع بيانات الكيان · GeoJSON":"Geometry joined with entity metadata · GeoJSON",url:"/api/exports/geojson",count:metadata.counts.features},
  ];
  return <div className="site-layout" lang={language} dir={ar?"rtl":"ltr"}>
    <SiteHeader language={language}/>
    <main className="site-content" id="main-content">
      <p className="site-eyebrow">{ar?"واجهة البيانات المفتوحة":"OPEN DATA"}</p>
      <h1>{ar?"تنزيل بيانات الأطلس":"Download atlas data"}</h1>
      <p className="site-lede">{ar?"نسخ قابلة للتنزيل من السجل المعتمد. تحفظ صيغ JSON وGeoJSON رموز الكيانات والمصادر؛ وتبقى الأدلة المتعارضة منفصلة.":"Downloadable snapshots of the canonical atlas. JSON and GeoJSON preserve entity identifiers and source lineage; conflicting evidence remains separate."}</p>
      <section className="export-meta-grid" aria-label={ar?"إصدار مجموعة البيانات":"Dataset version"}>
        <div><span>{ar?"الإصدار":"Dataset version"}</span><strong><code>{metadata.dataset_version}</code></strong></div>
        <div><span>{ar?"بصمة استيراد البيانات":"Import checksum"}</span><strong><code>{metadata.import_checksum}</code></strong></div>
        <div><span>{ar?"وقت التوليد":"Generated at"}</span><strong><time dateTime={metadata.generated_at}>{metadata.generated_at}</time></strong></div>
      </section>
      <section className="export-list" aria-label={ar?"التنزيلات":"Downloads"}>
        {links.map((item,index)=><article className="export-card" key={item.url}>
          <span className="export-index">{String(index+1).padStart(2,"0")}</span><div><h2>{item.name}</h2>{item.count!==null&&<p>{item.count.toLocaleString()} {ar?"سجلًا/ميزة":"records/features"}</p>}</div>
          <a href={item.url} download>{ar?"تنزيل":"Download"}<span aria-hidden="true"> ↓</span></a>
        </article>)}
      </section>
      <section className="license-block" aria-labelledby="license-title">
        <h2 id="license-title">{ar?"الإسناد والترخيص":"Attribution & licensing"}</h2>
        <p><strong>{ar?"الهندسة":"Geometry"}:</strong> {metadata.licenses.geometry}</p>
        <p><strong>{ar?"الخرائط الأساسية":"Basemap"}:</strong> {metadata.licenses.basemap}</p>
        <p><strong>{ar?"الحقائق والأدلة والبيانات غير المشتقة من OSM":"Facts, evidence & non-OSM data"}:</strong> {metadata.licenses.research_data}</p>
        <p><strong>{ar?"التواصل":"Contact"}:</strong> <bdi dir="ltr">{metadata.licenses.contact}</bdi></p>
        <p><strong>{ar?"رخصة الشيفرة":"Code license"}:</strong> {metadata.licenses.code}</p>
        <p><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">{ar?"تفاصيل رخصة المشاع الإبداعي CC BY 4.0":"CC BY 4.0 license terms"}</a></p>
      </section>
      <aside className="future-format-note"><strong>{ar?"GeoPackage لاحقًا":"GeoPackage later"}</strong><p>{ar?"يمكن إنشاء حزمة GeoPackage محليًا في إصدار لاحق باستخدام Python وGeoPandas من ملف GeoJSON المنزّل؛ لن يعتمد التصدير على قاعدة بيانات إنتاجية.":"A future release can create an offline GeoPackage with Python and GeoPandas from the downloaded GeoJSON; no production database access is needed."}</p></aside>
      <p className="site-backlink"><Link href={`/methodology?lang=${language}`}>{ar?"اقرأ المنهجية وملاحظات الترخيص ←":"Read methodology and licensing notes →"}</Link></p>
    </main>
    <SiteFooter language={language}/>
  </div>;
}
