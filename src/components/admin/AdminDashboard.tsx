"use client";

import { useCallback, useState } from "react";
import { AdminNav, AdminTokenGate, MetricCard, useAdminToken, type AdminLanguage } from "./AdminShell";

interface Counts {
  entities: number; facts: number; evidence: number; features: number; boundaries: number | null;
  unknown_statuses: number; facts_single_source: number; facts_without_evidence: number;
  entities_without_geometry: number; pending_submissions: number | null; open_conflicts: number | null;
  unreviewed_facts: number;
}

/**
 * BATCH 13 — dashboard.
 *
 * Every number comes from the API. A count that could not be measured is `null` and renders as «—»;
 * nothing is defaulted to zero, because a zero the dashboard invented is worse than an honest blank.
 */
export function AdminDashboard({ language }: { language: AdminLanguage }) {
  const ar = language === "ar";
  const { token, setToken } = useAdminToken();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/dashboard", { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as { ok?: boolean; counts?: Counts; error?: { message?: string } };
      if (!response.ok || !payload.counts) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      setCounts(payload.counts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally { setLoading(false); }
  }, [token]);

  return <AdminTokenGate language={language} token={token} setToken={setToken} onAuthenticated={load}>
    <AdminNav language={language} current="dashboard" />
    {loading && <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {counts && <>
      <section aria-label={ar ? "أعداد البيانات" : "Data counts"}>
        <h2>{ar ? "أعداد البيانات" : "Data counts"}</h2>
        <div className="admin-metric-grid">
          <MetricCard label={ar ? "كيانات" : "Entities"} value={counts.entities} />
          <MetricCard label={ar ? "حقائق" : "Facts"} value={counts.facts} />
          <MetricCard label={ar ? "أدلة" : "Evidence"} value={counts.evidence} />
          <MetricCard label={ar ? "أشكال هندسية" : "Features"} value={counts.features} />
          <MetricCard label={ar ? "حدود رسمية" : "Boundaries"} value={counts.boundaries}
            note={counts.boundaries === null ? (ar ? "تُقرأ من ملفات الحدود" : "read from boundary files") : undefined} />
        </div>
      </section>

      <section aria-label={ar ? "ما يحتاج انتباهًا" : "Needs attention"}>
        <h2>{ar ? "ما يحتاج انتباهًا" : "Needs attention"}</h2>
        <div className="admin-metric-grid">
          <MetricCard tone="warn" label={ar ? "حالة غير معروفة" : "Unknown status"} value={counts.unknown_statuses} />
          <MetricCard tone="warn" label={ar ? "كيانات بلا هندسة" : "Entities without geometry"} value={counts.entities_without_geometry} />
          <MetricCard tone="warn" label={ar ? "حقائق بمصدر واحد" : "Facts with a single source"} value={counts.facts_single_source} />
          <MetricCard tone="bad" label={ar ? "تعارضات مفتوحة" : "Open conflicts"} value={counts.open_conflicts}
            note={counts.open_conflicts === null ? (ar ? "غير متاح" : "unavailable") : undefined} />
          <MetricCard tone="bad" label={ar ? "حقائق بلا دليل" : "Facts without evidence"} value={counts.facts_without_evidence} />
          <MetricCard label={ar ? "اقتراحات معلّقة" : "Pending submissions"} value={counts.pending_submissions} />
          <MetricCard label={ar ? "حقائق بلا مراجعة" : "Unreviewed facts"} value={counts.unreviewed_facts} />
        </div>
      </section>
    </>}
  </AdminTokenGate>;
}
