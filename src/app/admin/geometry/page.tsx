import type { Metadata } from "next";
import { SiteFooter, SiteHeader, resolveLanguage } from "@/components/site/SiteChrome";
import { AdminGeometry } from "@/components/admin/AdminGeometry";

export const metadata: Metadata = { title: "Geometry review | Greater Cairo Atlas admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const language = resolveLanguage((await searchParams).lang);
  const ar = language === "ar";
  return <div className="site-layout" lang={language} dir={ar ? "rtl" : "ltr"}>
    <SiteHeader language={language} />
    <main className="site-content document-page admin-page" id="main-content">
      <p className="site-eyebrow">{ar ? "مساحة عمل البيانات" : "DATA WORKSPACE"}</p>
      <h1>{ar ? "مراجعة الهندسة" : "Geometry review"}</h1>
      <p className="quiet-note">{ar ? "الكيانات بلا هندسة، والهندسة المتعارضة بين المصدرين، ومصدر كل شكل." : "Entities without geometry, conflicting geometry between sources, and the source of every shape."}</p>
      <AdminGeometry language={language} />
    </main>
    <SiteFooter language={language} />
  </div>;
}
