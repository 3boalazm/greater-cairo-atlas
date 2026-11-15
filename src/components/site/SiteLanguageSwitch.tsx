"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function SiteLanguageSwitch({ language, label }: { language: "ar" | "en"; label: string }) {
  const pathname = usePathname() ?? "/";
  const path = pathname.replace(/^\/(?:ar|en)(?=\/|$)/, "") || "/";
  const other = language === "ar" ? "en" : "ar";
  return <Link className="site-language" href={`/${other}${path === "/" ? "" : path}`} hrefLang={other} lang={other} aria-label={language === "ar" ? "التبديل إلى اللغة الإنجليزية" : "Switch to Arabic"} title={label}>{label}</Link>;
}
