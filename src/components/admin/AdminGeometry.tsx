"use client";

/* eslint-disable react-hooks/set-state-in-effect -- server-side filtering is re-fetched whenever the filters change. */

import { useCallback, useEffect, useState } from "react";
import { AdminNav, AdminTokenGate, useAdminToken, type AdminLanguage } from "./AdminShell";

interface GeometryRow {
  entity_code: string; name_ar: string; name_en: string; entity_type: string;
  feature_count: number; sources: string[]; licenses: string[];
  has_conflict: boolean; conflict_sources: string[]; point_outside_boundary: boolean;
}

/**
 * BATCH 13 — geometry review.
 *
 * Three questions, one screen: which entities have no geometry, which have more than one source
 * drawing them (a conflict, not a preference), and where did each shape come from. Replacing a
 * geometry is only offered for an uploaded GeoJSON with a declared source and licence, and the old
 * geometry is kept in geometry_history — this screen never edits coordinates in place.
 */
export function AdminGeometry({ language }: { language: AdminLanguage }) {
  const ar = language === "ar";
  const { token, setToken } = useAdminToken();
  const [rows, setRows] = useState<GeometryRow[]>([]);
  const [filter, setFilter] = useState<"missing" | "conflict" | "outside_boundary" | "all">("missing");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/geometry?filter=${filter}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as { ok?: boolean; rows?: GeometryRow[]; error?: { message?: string } };
      if (!response.ok || !payload.rows) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      setRows(payload.rows); setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally { setLoading(false); }
  }, [token, filter]);

  useEffect(() => { if (token) void load(); }, [token, load]);

  return <AdminTokenGate language={language} token={token} setToken={setToken} onAuthenticated={load}>
    <AdminNav language={language} current="geometry" />
    <div className="admin-filters">
      <select value={filter} onChange={(event) => { setLoading(true); setFilter(event.target.value as typeof filter); }} aria-label={ar ? "عرض" : "Show"}>
        <option value="missing">{ar ? "بلا هندسة" : "Missing geometry"}</option>
        <option value="conflict">{ar ? "هندسة متعارضة بين المصدرين" : "Conflicting geometry"}</option>
        <option value="outside_boundary">{ar ? "نقطة خارج الحدود الرسمية" : "Point outside official boundary"}</option>
        <option value="all">{ar ? "الكل" : "All"}</option>
      </select>
    </div>
    {loading && <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    <table className="admin-table">
      <caption className="sr-only">{ar ? "مراجعة الهندسة" : "Geometry review"}</caption>
      <thead><tr>
        <th scope="col">{ar ? "الكيان" : "Entity"}</th>
        <th scope="col">{ar ? "عدد الأشكال" : "Features"}</th>
        <th scope="col">{ar ? "المصادر" : "Sources"}</th>
        <th scope="col">{ar ? "الترخيص" : "Licence"}</th>
        <th scope="col">{ar ? "ملاحظة" : "Note"}</th>
      </tr></thead>
      <tbody>{rows.map((row) => <tr key={row.entity_code}>
        <td><code>{row.entity_code}</code><br /><small>{ar ? row.name_ar : row.name_en}</small></td>
        <td>{row.feature_count.toLocaleString("en-US")}</td>
        <td>{row.sources.length ? row.sources.join(" · ") : "—"}</td>
        <td>{row.licenses.length ? row.licenses.join(" · ") : "—"}</td>
        <td>
          {row.feature_count === 0 && <span className="admin-chip is-warn">{ar ? "لا توجد هندسة" : "No geometry"}</span>}
          {row.has_conflict && <span className="admin-chip is-disputed" title={row.conflict_sources.join(", ")}>{ar ? "مصدران يرسمانها بشكل مختلف" : "Two sources disagree"}</span>}
          {row.point_outside_boundary && <span className="admin-chip is-bad">{ar ? "النقطة خارج الحدود الرسمية" : "Point outside official boundary"}</span>}
        </td>
      </tr>)}</tbody>
    </table>
    {!loading && rows.length === 0 && <p className="admin-empty">{ar ? "لا سجلات في هذا العرض." : "No rows for this view."}</p>}
    <p className="quiet-note">{ar
      ? "استبدال الهندسة يتطلب ملف GeoJSON مرفوعًا مع مصدر وترخيص معلن، ويحفظ الشكل السابق في السجل. لا يُعدَّل أي إحداثي هنا."
      : "Replacing a geometry requires an uploaded GeoJSON with a declared source and licence, and keeps the previous shape in history. No coordinate is edited here."}</p>
  </AdminTokenGate>;
}
