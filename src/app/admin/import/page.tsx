import type { Metadata } from "next";
import { SiteFooter, SiteHeader, resolveLanguage } from "@/components/site/SiteChrome";
import { AdminImport } from "@/components/admin/AdminImport";

export const metadata: Metadata = { title: "Import | Greater Cairo Atlas admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const language = resolveLanguage((await searchParams).lang);
  const ar = language === "ar";
  return <div className="site-layout" lang={language} dir={ar ? "rtl" : "ltr"}>
    <SiteHeader language={language} />
    <main className="site-content document-page admin-page" id="main-content">
      <p className="site-eyebrow">{ar ? "مساحة عمل البيانات" : "DATA WORKSPACE"}</p>
      <h1>{ar ? "استيراد" : "Import"}</h1>
      <p className="quiet-note">{ar ? "استيراد JSON/CSV بصيغة البذرة. التشغيل التجريبي هو الافتراضي." : "Import seed-format JSON/CSV. Dry run is the default."}</p>
      <AdminImport language={language} />
    </main>
    <SiteFooter language={language} />
  </div>;
}
