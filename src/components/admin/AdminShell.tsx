"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the token check re-runs whenever the token changes. */

import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

export type AdminLanguage = "ar" | "en";

/**
 * BATCH 13 — shared admin chrome.
 *
 * The token is held in React state only: it is never written to localStorage, never placed in a URL,
 * and never included in a rendered string. A reload forgets it, which is the point.
 */
export function useAdminToken() {
  const [token, setToken] = useState("");
  return { token, setToken };
}

export function AdminTokenGate({ language, token, setToken, children, onAuthenticated }: {
  language: AdminLanguage;
  token: string;
  setToken: (value: string) => void;
  children: React.ReactNode;
  onAuthenticated?: () => void;
}) {
  const ar = language === "ar";
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token.trim()) { setStatus("idle"); return; }
    const controller = new AbortController();
    setStatus("checking");
    fetch("/api/admin/entities?page_size=1", { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (response) => {
        if (response.ok) { setStatus("ok"); setMessage(""); onAuthenticated?.(); return; }
        const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
        setStatus("error");
        setMessage(payload.error?.message ?? `HTTP ${response.status}`);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Request failed");
      });
    return () => controller.abort();
    // onAuthenticated is intentionally not a dependency: it is a callback, not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return <div className="admin-workspace" dir={ar ? "rtl" : "ltr"} lang={language}>
    <div className="admin-token-bar">
      <label className="admin-token-field">
        <KeyRound aria-hidden="true" />
        <span>{ar ? "رمز الإدارة" : "Admin token"}</span>
        <input type="password" value={token} onChange={(event) => setToken(event.target.value)}
          autoComplete="off" spellCheck={false} placeholder={ar ? "يُطلب من خادم الموقع فقط" : "sent to the server only"} />
      </label>
      {status === "checking" && <span className="admin-status" role="status">{ar ? "جارٍ التحقق…" : "Checking…"}</span>}
      {status === "ok" && <span className="admin-status is-ok"><ShieldCheck aria-hidden="true" />{ar ? "تم التحقق" : "Authenticated"}</span>}
      {status === "error" && <span className="admin-status is-error" role="alert">{message || (ar ? "رمز غير صالح" : "Invalid token")}</span>}
    </div>
    {status === "ok" ? children : <p className="admin-gate-note">{ar
      ? "أدخل رمز الإدارة لعرض مساحة العمل. لا يُحفظ الرمز في المتصفح ولا يظهر في أي رد من الخادم."
      : "Enter the admin token to open the workspace. It is not stored in the browser and is never included in a server response."}</p>}
  </div>;
}

const NAV = [
  { href: "/admin", ar: "لوحة المتابعة", en: "Dashboard", key: "dashboard" },
  { href: "/admin/entities", ar: "الكيانات", en: "Entities", key: "entities" },
  { href: "/admin/facts", ar: "الحقائق والأدلة", en: "Facts & evidence", key: "facts" },
  { href: "/admin/geometry", ar: "مراجعة الهندسة", en: "Geometry", key: "geometry" },
  { href: "/admin/gaps", ar: "الفجوات والتعارضات", en: "Conflicts & gaps", key: "gaps" },
  { href: "/admin/import", ar: "استيراد", en: "Import", key: "import" },
  { href: "/admin/submissions", ar: "الاقتراحات", en: "Submissions", key: "submissions" },
] as const;

export function AdminNav({ language, current }: { language: AdminLanguage; current: string }) {
  return <nav className="admin-nav" aria-label={language === "ar" ? "أقسام مساحة العمل" : "Workspace sections"}>
    {NAV.map((item) => <Link key={item.key} href={`${item.href}?lang=${language}`} aria-current={item.key === current ? "page" : undefined}
      className={item.key === current ? "is-current" : undefined}>{language === "ar" ? item.ar : item.en}</Link>)}
  </nav>;
}

/** A count that could not be measured is rendered as an em dash, never as zero. */
export function MetricCard({ label, value, note, tone }: { label: string; value: number | string | null; note?: string; tone?: "warn" | "bad" }) {
  return <div className={`admin-metric ${tone ? `is-${tone}` : ""}`}>
    <span className="admin-metric-label">{label}</span>
    <strong className="admin-metric-value">{value === null ? "—" : typeof value === "number" ? value.toLocaleString("en-US") : value}</strong>
    {note && <small>{note}</small>}
  </div>;
}

export function AdminPagination({ language, page, pageSize, total, onPage }: {
  language: AdminLanguage; page: number; pageSize: number; total: number; onPage: (page: number) => void;
}) {
  const ar = language === "ar";
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="admin-pagination">
    <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1}>{ar ? "السابق" : "Previous"}</button>
    <span>{ar ? `صفحة ${page} من ${pages}` : `Page ${page} of ${pages}`} · {total.toLocaleString("en-US")} {ar ? "سجلًا" : "rows"}</span>
    <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages}>{ar ? "التالي" : "Next"}</button>
  </div>;
}
