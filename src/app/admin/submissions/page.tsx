import type { Metadata } from "next";
import { SiteFooter, SiteHeader, resolveLanguage } from "@/components/site/SiteChrome";
import { SubmissionsReview } from "@/components/admin/SubmissionsReview";

export const metadata: Metadata = { title: "Submission review | Greater Cairo Atlas", robots: { index: false, follow: false } };

export default async function AdminSubmissionsPage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const language = resolveLanguage((await searchParams).lang);
  const ar = language === "ar";
  return <div className="site-layout" lang={language} dir={ar ? "rtl" : "ltr"}><SiteHeader language={language}/><main className="site-content document-page" id="main-content">
    <p className="site-eyebrow">{ar ? "مراجعة بشرية" : "HUMAN REVIEW"}</p><h1>{ar ? "مراجعة اقتراحات المجتمع" : "Community submissions review"}</h1>
    <p className="quiet-note">{ar ? "القبول ينقل الاقتراح إلى ملف مراجعة بحثية فقط. لا تُعدّل الحقائق أو الأدلة تلقائيًا." : "Accepting adds a suggestion to the research-review export only. Canonical facts and evidence are never updated automatically."}</p>
    <SubmissionsReview language={language}/>
  </main><SiteFooter language={language}/></div>;
}
