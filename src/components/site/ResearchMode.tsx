"use client";
/* eslint-disable react-hooks/set-state-in-effect -- localStorage is the persisted preference source during client hydration. */

import { createContext, useContext, useEffect, useState } from "react";
import { Microscope } from "lucide-react";

interface ResearchModeValue { researcherMode: boolean; toggleResearcherMode: () => void; }
const Context = createContext<ResearchModeValue | null>(null);
const KEY = "gca-researcher-mode";

export function ResearchModeProvider({ children }: { children: React.ReactNode }) {
  const [researcherMode, setResearcherMode] = useState(false);
  useEffect(() => {
    try { setResearcherMode(localStorage.getItem(KEY) === "true"); } catch { /* Optional preference. */ }
  }, []);
  const toggleResearcherMode = () => setResearcherMode((value) => {
    const next = !value;
    try { localStorage.setItem(KEY, String(next)); } catch { /* Optional preference. */ }
    return next;
  });
  return <Context.Provider value={{ researcherMode, toggleResearcherMode }}>{children}</Context.Provider>;
}

export function useResearchMode() {
  const value = useContext(Context);
  if (!value) throw new Error("ResearchModeProvider is missing.");
  return value;
}

export function ResearcherOnly({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { researcherMode } = useResearchMode();
  return researcherMode ? <div className={`researcher-only ${className}`}>{children}</div> : null;
}

export function ResearchModeToggle({ language, compact = false }: { language: "ar" | "en"; compact?: boolean }) {
  const { researcherMode, toggleResearcherMode } = useResearchMode();
  const ar = language === "ar";
  const label = compact ? (researcherMode ? (ar ? "باحث ✓" : "Research ✓") : (ar ? "باحث" : "Research")) : (researcherMode ? (ar ? "وضع الباحث: مفعّل" : "Researcher mode: on") : (ar ? "وضع الباحث" : "Researcher mode"));
  return <button className={`research-mode-toggle ${compact ? "is-compact" : ""} ${researcherMode ? "is-active" : ""}`} type="button" aria-label={compact ? (ar ? "تبديل وضع الباحث" : "Toggle researcher mode") : label} title={compact ? label : undefined} aria-pressed={researcherMode} onClick={toggleResearcherMode}>
    <Microscope aria-hidden="true"/><span>{label}</span>
  </button>;
}
