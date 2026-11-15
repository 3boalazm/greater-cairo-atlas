"use client";
/* eslint-disable react-hooks/set-state-in-effect -- hydrate the saved theme preference after mount. */

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function SiteThemeToggle({ language }: { language: "ar" | "en" }) {
  const [theme, setTheme] = useState<"day" | "night">("night");
  useEffect(() => {
    const saved = window.localStorage.getItem("gca-theme");
    if (saved === "day" || saved === "night") setTheme(saved);
  }, []);
  const toggle = () => {
    const next = theme === "night" ? "day" : "night";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem("gca-theme", next); } catch { /* Preference persistence is optional. */ }
  };
  const label = language === "ar" ? (theme === "night" ? "التبديل إلى الوضع النهاري" : "التبديل إلى الوضع الليلي") : `Switch to ${theme === "night" ? "day" : "night"} mode`;
  return <button className="site-theme-toggle" type="button" onClick={toggle} aria-label={label} title={label}>
    {theme === "night" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    <span>{language === "ar" ? (theme === "night" ? "نهار" : "ليل") : (theme === "night" ? "Day" : "Night")}</span>
  </button>;
}
