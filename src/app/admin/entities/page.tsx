import type { Metadata } from "next";
import { SiteFooter, SiteHeader, resolveLanguage } from "@/components/site/SiteChrome";
import { AdminEntities } from "@/components/admin/AdminEntities";

export const metadata: Metadata = { title: "Entities | Greater Cairo Atlas admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const language = resolveLanguage((await searchParams).lang);
  const ar = language === "ar";
  return <div className="site-layout" lang={language} dir={ar ? "rtl" : "ltr"}>
    <SiteHeader language={language} />
    <main className="site-content document-page admin-page" id="main-content">
      <p className="site-eyebrow">{ar ? "مساحة عمل البيانات" : "DATA WORKSPACE"}</p>
      <h1>{ar ? "الكيانات" : "Entities"}</h1>
      <p className="quiet-note">{ar ? "جدول كيانات الأطلس مع البحث والفلاتر." : "Atlas entities with search and filters."}</p>
      <AdminEntities language={language} />
    </main>
    <SiteFooter language={language} />
  </div>;
}
