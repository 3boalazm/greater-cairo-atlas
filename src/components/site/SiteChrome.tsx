import Link from "next/link";

export type SiteLanguage = "ar" | "en";

const labels = {
  ar: { atlas: "أطلس القاهرة الكبرى", data: "البيانات", directory: "الدليل", methodology: "المنهجية", sources: "المصادر", home: "الخريطة", lang: "English" },
  en: { atlas: "Greater Cairo Atlas", data: "Data", directory: "Directory", methodology: "Methodology", sources: "Sources", home: "Map", lang: "العربية" },
};

export function SiteHeader({ language = "ar" }: { language?: SiteLanguage }) {
  const text = labels[language];
  const other = language === "ar" ? "en" : "ar";
  return <header className="site-header">
    <a className="skip-link" href="#main-content">{language === "ar" ? "تجاوز إلى المحتوى" : "Skip to content"}</a>
    <Link className="site-brand" href="/">{text.atlas}</Link>
    <nav aria-label={language === "ar" ? "التنقل الرئيسي" : "Main navigation"}>
      <Link href="/">{text.home}</Link>
      <Link href={`/directory?lang=${language}`}>{text.directory}</Link>
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
    <span>{language === "ar" ? "حقائق البحث والأدلة وكل البيانات غير المشتقة من OSM: © Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0 | الهندسة المشتقة من OpenStreetMap: © OpenStreetMap contributors, ODbL 1.0" : "Research facts, evidence, and all data not derived from OpenStreetMap: © Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0 | OpenStreetMap-derived geometry: © OpenStreetMap contributors, ODbL 1.0"}</span>
    <nav aria-label={language === "ar" ? "روابط معلوماتية" : "Information links"}>
      <Link href={`/directory?lang=${language}`}>{text.directory}</Link>
      <Link href={`/data?lang=${language}`}>{text.data}</Link>
      <Link href={`/methodology?lang=${language}`}>{text.methodology}</Link>
      <Link href={`/sources?lang=${language}`}>{text.sources}</Link>
    </nav>
  </footer>;
}

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return (configured || "https://greater-cairo-atlas.vercel.app").replace(/\/$/, "");
}

export function resolveLanguage(value?: string | string[]): SiteLanguage {
  return (Array.isArray(value) ? value[0] : value) === "en" ? "en" : "ar";
}
