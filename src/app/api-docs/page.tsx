import type { Metadata } from "next";
import Link from "next/link";
import { getSiteUrl, localizedPath, resolveLanguage } from "@/components/site/SiteChrome";
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }): Promise<Metadata> {
  const language = resolveLanguage((await searchParams).lang);
  const canonical = `${getSiteUrl()}${localizedPath(language, "/api-docs")}`;
  return { title: language === "ar" ? "توثيق API | أطلس القاهرة الكبرى" : "API documentation | Greater Cairo Atlas", description: "Bilingual OpenAPI documentation for the Greater Cairo Atlas.", alternates: { canonical, languages: { ar: `${getSiteUrl()}/ar/api-docs`, en: `${getSiteUrl()}/en/api-docs` } } };
}
const routes: Array<[string, string, string]> = [
  ["GET", "/api/atlas/stats", "إحصاءات الأطلس ومؤشرات مجموعات البيانات / Dataset statistics and source counts"],
  ["GET", "/api/atlas/entities", "قائمة الكيانات مع مرشحات النوع والقطاع والحالة / Filterable entity list"],
  ["GET", "/api/atlas/entities/{code}", "تفاصيل الكيان وحقائقه ومصادره وعلاقاته / Entity, facts, evidence and relations"],
  ["GET", "/api/atlas/entities/{code}/boundary", "حدود الكيان بصيغة GeoJSON / Entity boundary GeoJSON"],
  ["GET", "/api/atlas/features", "معالم الخريطة مع مرشحات النوع والقطاع والحالة والتكبير / Filtered map features"],
  ["GET", "/api/atlas/evidence", "فهرس المصادر والأدلة / Evidence catalogue"],
  ["GET", "/api/atlas/evidence/{code}", "سجل المصدر والحقائق المرتبطة / Evidence detail and linked facts"],
  ["GET", "/api/atlas/relations", "العلاقات الموثقة بين الكيانات / Documented entity relations"],
  ["GET", "/rail-network.geojson", "شبكة السكك الحديدية المبسطة / Generalized rail network"],
  ["GET", "/rail-network-detail.geojson", "شبكة السكك الحديدية التفصيلية / Detailed rail network"],
  ["GET", "/rail-network-status.json", "حالة وتوفر بيانات السكك / Rail asset availability"],
  ["GET", "/api/health", "حالة الخدمة والاعتمادات / Service health"],
  ["GET", "/api/exports/geojson", "تصدير الخريطة ومرشحاتها الحالية / Current filtered-map GeoJSON export"],
  ["GET", "/api/exports/geopackage", "حزمة GeoPackage مع الإسناد والترخيص / GeoPackage with attribution"],
  ["GET", "/api/exports/entities/{code}", "تصدير كيان مع حقائقه وأدلته وهندسته / Per-entity export"],
  ["GET", "/api/exports/csv?table=facts", "تصدير جدول CSV / CSV table export"],
  ["GET", "/api/exports/json", "تصدير مجموعة البيانات الكاملة / Full dataset JSON"],
  ["POST", "/api/submissions", "اقتراح مراجعة بشرية؛ لا يعدّل الحقائق / Suggestion for human review; never updates facts"],
];
export default function ApiDocsPage() {
  return <main className="api-docs-page" dir="auto">
    <header><p className="eyebrow">GREATER CAIRO ATLAS · API</p><h1>توثيق الواجهة البرمجية <span>/ API documentation</span></h1><p>نقاط النهاية العامة، المرشحات، التخزين المؤقت، وصيغ التصدير. Public endpoints, filters, caching, and export formats.</p><Link href="/api/openapi.json">تحميل مواصفة OpenAPI 3.1 بصيغة JSON / Download OpenAPI 3.1 JSON →</Link></header>
    <section><h2>نقاط النهاية العامة / Public endpoints</h2><div className="api-route-list">{routes.map(([method,path,summary])=><article key={path}><code>{method}</code>{path.includes("{") ? <code className="api-path-template">{path}</code> : <a href={path}>{path}</a>}<p>{summary}</p></article>)}</div></section>
    <section><h2>المعاملات / Parameters</h2><p><code>type</code> يرشح نوع الكيان؛ <code>sector</code> يرشح القطاع؛ <code>status</code> يرشح الحالة؛ <code>zoom</code> يبسط معالم الخريطة؛ و<code>has_geometry</code> لتصفية الكيانات ذات الهندسة، و<code>limit</code>/<code>offset</code> للتصفح حيثما ينطبق. GeoPackage يقبل أيضًا <code>year</code> لتحديد الحالة من الحقائق المؤرخة فقط.</p><p><code>GET /api/exports/csv?table=entities|facts|evidence|fact_evidence</code>. يدعم GeoJSON وGeoPackage مرشحات <code>type</code> و<code>sector</code> و<code>status</code>.</p></section>
    <section><h2>التخزين المؤقت والتراخيص / Caching and licenses</h2><p>البيانات العامة قابلة للتخزين المؤقت وتستخدم <code>s-maxage</code> و<code>stale-while-revalidate</code>؛ استجابات المساهمات الإدارية غير قابلة للتخزين. Public GET responses use cache headers with stale-while-revalidate; private review responses are no-store.</p><p>بيانات البحث CC BY 4.0؛ هندسة OpenStreetMap مرخصة ODbL 1.0. تحفظ ملفات التصدير الإسناد والترخيص في الرؤوس أو في جدول <code>license_attribution</code>. Research data CC BY 4.0; OSM-derived geometry ODbL 1.0. Exports retain attribution in response headers or the <code>license_attribution</code> table.</p><p>تُراجع الاقتراحات بشريًا ولا تغيّر الحقائق أو الخرائط تلقائيًا. Contributions require human review and never modify canonical facts.</p></section>
  </main>;
}
