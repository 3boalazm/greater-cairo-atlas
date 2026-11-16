"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { useState } from "react";
import type { AtlasLanguage } from "./atlas-client";

export function MapLoading({ language }: { language: AtlasLanguage }) {
  return <div className="map-loading" role="status">{language === "ar" ? "جارٍ تحميل الخريطة التفاعلية…" : "Loading interactive map…"}</div>;
}

export function MapAttribution({ language }: { language: AtlasLanguage }) {
  const [open, setOpen] = useState(false);
  return <div className={`map-attribution ${open ? "is-open" : ""}`} aria-label={language === "ar" ? "إسناد بيانات الأطلس" : "Atlas data attribution"}>
    <button className="attribution-toggle" type="button" aria-expanded={open} aria-label={language === "ar" ? "إسناد البيانات" : "Data attribution"} onClick={() => setOpen((value) => !value)}><Info aria-hidden="true" /></button>
    <span className="attribution-credits"><Link href={`/${language}/sources`}>© Mustafa Aboalazm · CC BY 4.0</Link> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL 1.0</a> · <a href="https://data.humdata.org/dataset/cod-ab-egy" target="_blank" rel="noreferrer">© CAPMAS / OCHA · CC BY-IGO</a> · <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a></span>
  </div>;
}

export function InfoMenu({ language }: { language: AtlasLanguage }) {
  const ar = language === "ar";
  return <details className="atlas-info-menu"><summary><Info aria-hidden="true" />{ar ? "معلومات" : "Info"}</summary>
    <nav aria-label={ar ? "معلومات الأطلس" : "Atlas information"}>
      <Link href={`/${language}/data`}>{ar ? "البيانات" : "Data"}</Link>
      <Link href={`/${language}/methodology`}>{ar ? "المنهجية" : "Methodology"}</Link>
      <Link href={`/${language}/sources`}>{ar ? "المصادر" : "Sources"}</Link>
      <Link href={`/${language}/directory`}>{ar ? "الدليل" : "Directory"}</Link>
      <Link href={`/${language}/api-docs`}>{ar ? "توثيق API" : "API docs"}</Link>
    </nav>
  </details>;
}
