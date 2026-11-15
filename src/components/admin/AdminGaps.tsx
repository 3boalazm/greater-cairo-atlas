"use client";

/* eslint-disable react-hooks/set-state-in-effect -- server-side filtering is re-fetched whenever the filters change. */

import { useCallback, useEffect, useState } from "react";
import { AdminNav, AdminTokenGate, useAdminToken, type AdminLanguage } from "./AdminShell";

interface GapGroup { kind: string; label_ar: string; label_en: string; severity: "high" | "medium" | "low"; count: number | null; note_ar: string; note_en: string; }

/**
 * BATCH 13 — conflicts & gaps.
 *
 * These are the questions the atlas cannot answer yet, listed honestly: a count that is unavailable is
 * shown as «—» rather than zero, and every gap links to the screen where it can be fixed.
 */
export function AdminGaps({ language }: { language: AdminLanguage }) {
  const ar = language === "ar";
  const { token, setToken } = useAdminToken();
  const [groups, setGroups] = useState<GapGroup[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/gaps", { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as { ok?: boolean; groups?: GapGroup[]; error?: { message?: string } };
      if (!response.ok || !payload.groups) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      setGroups(payload.groups); setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (token) void load(); }, [token, load]);

  return <AdminTokenGate language={language} token={token} setToken={setToken} onAuthenticated={load}>
    <AdminNav language={language} current="gaps" />
    {loading && <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    <table className="admin-table">
      <caption className="sr-only">{ar ? "الفجوات والتعارضات" : "Conflicts and gaps"}</caption>
      <thead><tr>
        <th scope="col">{ar ? "الحالة" : "Issue"}</th>
        <th scope="col">{ar ? "العدد" : "Count"}</th>
        <th scope="col">{ar ? "أين تُعالَج" : "Where to act"}</th>
      </tr></thead>
      <tbody>{groups.map((group) => <tr key={group.kind} className={`is-${group.severity}`}>
        <td><strong>{ar ? group.label_ar : group.label_en}</strong><br /><small>{ar ? group.note_ar : group.note_en}</small></td>
        <td>{group.count === null ? "—" : group.count.toLocaleString("en-US")}</td>
        <td>{group.kind === "open_conflicts" || group.kind === "single_source"
          ? <a href={`/admin/facts?lang=${language}`}>{ar ? "مراجعة الحقائق" : "Facts review"}</a>
          : group.kind === "without_geometry"
            ? <a href={`/admin/geometry?lang=${language}`}>{ar ? "مراجعة الهندسة" : "Geometry review"}</a>
            : <a href={`/admin/entities?lang=${language}`}>{ar ? "الكيانات" : "Entities"}</a>}</td>
      </tr>)}</tbody>
    </table>
  </AdminTokenGate>;
}
