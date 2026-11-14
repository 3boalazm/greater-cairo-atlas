"use client";
/* eslint-disable react-hooks/set-state-in-effect -- hydrate saved preferences from localStorage after mount. */

import { Languages, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import type { AtlasLanguage, AtlasTheme } from "./atlas-client";

export function useAtlasPreferences() {
  const [theme, setTheme] = useState<AtlasTheme>("night");
  const [language, setLanguage] = useState<AtlasLanguage>("ar");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("gca-theme");
    if (savedTheme === "day" || savedTheme === "night") setTheme(savedTheme);
    const savedLanguage = window.localStorage.getItem("gca-language");
    if (savedLanguage === "ar" || savedLanguage === "en") setLanguage(savedLanguage);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("gca-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    window.localStorage.setItem("gca-language", language);
  }, [language]);

  return { theme, setTheme, language, setLanguage };
}

export function ThemeToggle({ theme, onChange, language }: {
  theme: AtlasTheme;
  onChange: (theme: AtlasTheme) => void;
  language: AtlasLanguage;
}) {
  const next = theme === "night" ? "day" : "night";
  const label = language === "ar" ? (next === "day" ? "التبديل إلى أطلس النهار" : "التبديل إلى أطلس الليل") : `Switch to ${next === "day" ? "Day Atlas" : "Night Atlas"}`;
  return <Button type="button" variant="outline" size="sm" className="atlas-icon-button" onClick={() => onChange(next)} aria-label={label} title={label}>
    {theme === "night" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    <span>{language === "ar" ? (theme === "night" ? "نهار" : "ليل") : (theme === "night" ? "Day" : "Night")}</span>
  </Button>;
}

export function LanguageToggle({ language, onChange }: {
  language: AtlasLanguage;
  onChange: (language: AtlasLanguage) => void;
}) {
  return <Button type="button" variant="outline" size="sm" className="atlas-icon-button language-button" onClick={() => onChange(language === "ar" ? "en" : "ar")} aria-label={language === "ar" ? "Switch to English" : "التبديل إلى العربية"}>
    <Languages aria-hidden="true" /><span>{language === "ar" ? "EN" : "عربي"}</span>
  </Button>;
}
