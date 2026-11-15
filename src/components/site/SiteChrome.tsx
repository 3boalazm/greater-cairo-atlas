import Link from "next/link";
import { SiteThemeToggle } from "@/components/site/SiteThemeToggle";
import { ResearchModeToggle } from "@/components/site/ResearchMode";
import { SiteLanguageSwitch } from "@/components/site/SiteLanguageSwitch";
import { ResearcherOnly } from "@/components/site/ResearchMode";

export type SiteLanguage = "ar" | "en";
export function localizedPath(language: SiteLanguage, path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `/${language}${normalized === "/" ? "" : normalized}`;
}

const labels = {
  ar: { atlas: "أطلس القاهرة الكبرى", data: "البيانات", directory: "الدليل", methodology: "المنهجية", sources: "المصادر", apiDocs: "توثيق API", home: "الخريطة", lang: "English" },
  en: { atlas: "Greater Cairo Atlas", data: "Data", directory: "Directory", methodology: "Methodology", sources: "Sources", apiDocs: "API docs", home: "Map", lang: "العربية" },
};

export function SiteHeader({ language = "ar" }: { language?: SiteLanguage }) {
  const text = labels[language];
  return <header className="site-header">
    <a className="skip-link" href="#main-content">{language === "ar" ? "تجاوز إلى المحتوى" : "Skip to content"}</a>
      <Link className="site-brand" href={localizedPath(language)}>{text.atlas}</Link>
      <ResearcherOnly><nav aria-label={language === "ar" ? "التنقل البحثي" : "Research navigation"}>
        <Link href={localizedPath(language, "/directory")}>{text.directory}</Link>
        <Link href={localizedPath(language, "/data")}>{text.data}</Link>
        <Link href={localizedPath(language, "/methodology")}>{text.methodology}</Link>
        <Link href={localizedPath(language, "/sources")}>{text.sources}</Link>
        <Link href={localizedPath(language, "/api-docs")}>{text.apiDocs}</Link>
      </nav></ResearcherOnly>
      <div className="site-header-actions"><ResearchModeToggle language={language}/><SiteThemeToggle language={language}/><SiteLanguageSwitch language={language} label={text.lang} /></div>
  </header>;
}

export function SiteFooter({ language = "ar" }: { language?: SiteLanguage }) {
  const text = labels[language];
  return <footer className="site-footer">
    <span>{language === "ar" ? "أطلس موثّق · لا تخمين للحالة أو الهندسة" : "Evidence-led atlas · no inferred status or geometry"}</span>
    <span>{language === "ar" ? "حقائق البحث والأدلة وكل البيانات غير المشتقة من OSM: © Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0 | الهندسة المشتقة من OpenStreetMap: © OpenStreetMap contributors, ODbL 1.0" : "Research facts, evidence, and all data not derived from OpenStreetMap: © Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0 | OpenStreetMap-derived geometry: © OpenStreetMap contributors, ODbL 1.0"}</span>
    <ResearcherOnly><nav aria-label={language === "ar" ? "روابط الباحث" : "Research links"}>
      <Link href={localizedPath(language, "/directory")}>{text.directory}</Link>
      <Link href={localizedPath(language, "/data")}>{text.data}</Link>
      <Link href={localizedPath(language, "/methodology")}>{text.methodology}</Link>
      <Link href={localizedPath(language, "/sources")}>{text.sources}</Link>
      <Link href={localizedPath(language, "/api-docs")}>{text.apiDocs}</Link>
    </nav></ResearcherOnly>
  </footer>;
}

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return (configured || "https://greater-cairo-atlas.vercel.app").replace(/\/$/, "");
}

export function resolveLanguage(value?: string | string[]): SiteLanguage {
  return (Array.isArray(value) ? value[0] : value) === "en" ? "en" : "ar";
}
