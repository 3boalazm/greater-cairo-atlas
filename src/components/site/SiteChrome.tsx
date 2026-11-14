import Link from "next/link";

export type SiteLanguage = "ar" | "en";

const labels = {
  ar: { atlas: "أطلس القاهرة الكبرى", data: "البيانات", methodology: "المنهجية", sources: "المصادر", home: "الخريطة", lang: "English" },
  en: { atlas: "Greater Cairo Atlas", data: "Data", methodology: "Methodology", sources: "Sources", home: "Map", lang: "العربية" },
};

export function SiteHeader({ language = "ar" }: { language?: SiteLanguage }) {
  const text = labels[language];
  const other = language === "ar" ? "en" : "ar";
  return <header className="site-header">
    <Link className="site-brand" href="/">{text.atlas}</Link>
    <nav aria-label={language === "ar" ? "التنقل الرئيسي" : "Main navigation"}>
      <Link href="/">{text.home}</Link>
      <Link href={`/data?lang=${language}`}>{text.data}</Link>
      <Link href={`/methodology?lang=${language}`}>{text.methodology}</Link>
      <Link href={`/sources?lang=${language}`}>{text.sources}</Link>
    </nav>
    <Link className="site-language" href={`?lang=${other}`} hrefLang={other}>{text.lang}</Link>
  </header>;
}

export function SiteFooter({ language = "ar" }: { language?: SiteLanguage }) {
  const text = labels[language];
  return <footer className="site-footer">
    <span>{language === "ar" ? "أطلس موثّق · لا تخمين للحالة أو الهندسة" : "Evidence-led atlas · no inferred status or geometry"}</span>
    <nav aria-label={language === "ar" ? "روابط معلوماتية" : "Information links"}>
      <Link href={`/data?lang=${language}`}>{text.data}</Link>
      <Link href={`/methodology?lang=${language}`}>{text.methodology}</Link>
      <Link href={`/sources?lang=${language}`}>{text.sources}</Link>
    </nav>
  </footer>;
}

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const deployment = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
  return (configured || deployment || "https://greater-cairo-atlas.vercel.app").replace(/\/$/, "");
}

export function resolveLanguage(value?: string | string[]): SiteLanguage {
  return (Array.isArray(value) ? value[0] : value) === "en" ? "en" : "ar";
}
