import type { Metadata } from "next";
import { SiteFooter, SiteHeader, resolveLanguage } from "@/components/site/SiteChrome";
import { AdminGaps } from "@/components/admin/AdminGaps";

export const metadata: Metadata = { title: "Conflicts and gaps | Greater Cairo Atlas admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const language = resolveLanguage((await searchParams).lang);
  const ar = language === "ar";
  return <div className="site-layout" lang={language} dir={ar ? "rtl" : "ltr"}>
    <SiteHeader language={language} />
    <main className="site-content document-page admin-page" id="main-content">
      <p className="site-eyebrow">{ar ? "مساحة عمل البيانات" : "DATA WORKSPACE"}</p>
      <h1>{ar ? "الفجوات والتعارضات" : "Conflicts & gaps"}</h1>
      <p className="quiet-note">{ar ? "قيم متعارضة، وحالات غير معروفة، ومحطات بلا وضع نقل، وكيانات بلا دليل." : "Conflicting values, unknown statuses, stations without a mode, and entities without evidence."}</p>
      <AdminGaps language={language} />
    </main>
    <SiteFooter language={language} />
  </div>;
}
