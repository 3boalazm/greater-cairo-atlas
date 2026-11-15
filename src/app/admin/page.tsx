import type { Metadata } from "next";
import { SiteFooter, SiteHeader, resolveLanguage } from "@/components/site/SiteChrome";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata: Metadata = { title: "Data workspace | Greater Cairo Atlas", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminHomePage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const language = resolveLanguage((await searchParams).lang);
  const ar = language === "ar";
  return <div className="site-layout" lang={language} dir={ar ? "rtl" : "ltr"}>
    <SiteHeader language={language} />
    <main className="site-content document-page admin-page" id="main-content">
      <p className="site-eyebrow">{ar ? "مساحة عمل البيانات" : "DATA WORKSPACE"}</p>
      <h1>{ar ? "مراجعة البيانات واعتمادها" : "Review and approve data"}</h1>
      <p className="quiet-note">{ar
        ? "كل إجراء يُسجَّل في سجل تدقيق لا يُعدَّل ولا يُحذف. لا يُحذف أي سجل، والحقيقة الموثّقة تحتاج دليلًا رسميًا برابط."
        : "Every action is written to an audit log that cannot be edited or deleted. Nothing is deleted, and a verified fact still needs an official source with a URL."}</p>
      <AdminDashboard language={language} />
    </main>
    <SiteFooter language={language} />
  </div>;
}
