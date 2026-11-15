import type { Metadata } from "next";
import { SiteFooter, SiteHeader, resolveLanguage } from "@/components/site/SiteChrome";
import { AdminFacts } from "@/components/admin/AdminFacts";

export const metadata: Metadata = { title: "Facts and evidence | Greater Cairo Atlas admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const language = resolveLanguage((await searchParams).lang);
  const ar = language === "ar";
  return <div className="site-layout" lang={language} dir={ar ? "rtl" : "ltr"}>
    <SiteHeader language={language} />
    <main className="site-content document-page admin-page" id="main-content">
      <p className="site-eyebrow">{ar ? "مساحة عمل البيانات" : "DATA WORKSPACE"}</p>
      <h1>{ar ? "الحقائق والأدلة" : "Facts & evidence"}</h1>
      <p className="quiet-note">{ar ? "مراجعة الحقائق وأدلتها. لا يُحذف أي سجل، وكل قرار يُسجَّل." : "Review facts and their evidence. Nothing is deleted; every decision is audited."}</p>
      <AdminFacts language={language} />
    </main>
    <SiteFooter language={language} />
  </div>;
}
