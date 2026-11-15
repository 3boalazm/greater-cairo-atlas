"use client";

/* eslint-disable react-hooks/set-state-in-effect -- server-side filtering is re-fetched whenever the filters change. */

import { useCallback, useEffect, useState } from "react";
import { AdminNav, AdminPagination, AdminTokenGate, useAdminToken, type AdminLanguage } from "./AdminShell";

interface EntityRow {
  code: string; name_ar: string; name_en: string; entity_type: string; sector: string; status: string;
  has_geometry: boolean; has_boundary: boolean;
}

const TYPES = ["city", "district", "neighborhood", "road", "bridge", "interchange", "transit_line", "transit_stop", "rail_station", "airport", "project", "authority", "landmark"];
const SECTORS = ["NORTH", "EAST", "SOUTH", "WEST", "CENTRAL", "REGIONAL"];
const STATUSES = ["operational", "under_construction", "planned", "unknown", "disused"];

/**
 * BATCH 13 — entity table. Filtering and paging happen on the server; the page never holds the whole
 * table in memory, and the Arabic search runs against the database, not a client-side copy.
 */
export function AdminEntities({ language }: { language: AdminLanguage }) {
  const ar = language === "ar";
  const { token, setToken } = useAdminToken();
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: "", type: "", sector: "", status: "", geometry: "", boundary: "" });

  // The first statement is the request itself, so this effect never sets state during render.
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.type) params.set("type", filters.type);
      if (filters.sector) params.set("sector", filters.sector);
      if (filters.status) params.set("status", filters.status);
      if (filters.geometry) params.set("geometry", filters.geometry);
      if (filters.boundary) params.set("boundary", filters.boundary);
      const response = await fetch(`/api/admin/entities?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as { ok?: boolean; rows?: EntityRow[]; total?: number; error?: { message?: string } };
      if (!response.ok || !payload.rows) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      setRows(payload.rows); setTotal(payload.total ?? 0);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally { setLoading(false); }
  }, [token, page, pageSize, filters]);

  useEffect(() => { if (token) void load(); }, [token, load]);

  const update = (patch: Partial<typeof filters>) => { setLoading(true); setPage(1); setFilters((current) => ({ ...current, ...patch })); };

  return <AdminTokenGate language={language} token={token} setToken={setToken} onAuthenticated={load}>
    <AdminNav language={language} current="entities" />
    <div className="admin-filters">
      <input type="search" value={filters.q} onChange={(event) => update({ q: event.target.value })}
        placeholder={ar ? "ابحث بالاسم العربي أو الإنجليزي أو بالرمز" : "Search Arabic/English name or code"} aria-label={ar ? "بحث" : "Search"} />
      <select value={filters.type} onChange={(event) => update({ type: event.target.value })} aria-label={ar ? "النوع" : "Type"}>
        <option value="">{ar ? "كل الأنواع" : "All types"}</option>
        {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
      </select>
      <select value={filters.sector} onChange={(event) => update({ sector: event.target.value })} aria-label={ar ? "القطاع" : "Sector"}>
        <option value="">{ar ? "كل القطاعات" : "All sectors"}</option>
        {SECTORS.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
      </select>
      <select value={filters.status} onChange={(event) => update({ status: event.target.value })} aria-label={ar ? "الحالة" : "Status"}>
        <option value="">{ar ? "كل الحالات" : "All statuses"}</option>
        {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      <select value={filters.geometry} onChange={(event) => update({ geometry: event.target.value })} aria-label={ar ? "هندسة" : "Geometry"}>
        <option value="">{ar ? "الهندسة: الكل" : "Geometry: any"}</option>
        <option value="true">{ar ? "لها هندسة" : "Has geometry"}</option>
        <option value="false">{ar ? "بلا هندسة" : "No geometry"}</option>
      </select>
      <select value={filters.boundary} onChange={(event) => update({ boundary: event.target.value })} aria-label={ar ? "حدود" : "Boundary"}>
        <option value="">{ar ? "الحدود: الكل" : "Boundary: any"}</option>
        <option value="true">{ar ? "لها حدود" : "Has boundary"}</option>
        <option value="false">{ar ? "بلا حدود" : "No boundary"}</option>
      </select>
    </div>
    {loading && <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    <table className="admin-table">
      <caption className="sr-only">{ar ? "كيانات الأطلس" : "Atlas entities"}</caption>
      <thead><tr>
        <th scope="col">{ar ? "الرمز" : "Code"}</th>
        <th scope="col">{ar ? "الاسم" : "Name"}</th>
        <th scope="col">{ar ? "النوع" : "Type"}</th>
        <th scope="col">{ar ? "القطاع" : "Sector"}</th>
        <th scope="col">{ar ? "الحالة" : "Status"}</th>
        <th scope="col">{ar ? "هندسة" : "Geometry"}</th>
        <th scope="col">{ar ? "حدود" : "Boundary"}</th>
      </tr></thead>
      <tbody>{rows.map((row) => <tr key={row.code}>
        <td><code>{row.code}</code></td>
        <td>{ar ? row.name_ar : row.name_en}</td>
        <td>{row.entity_type}</td>
        <td>{row.sector}</td>
        <td>{row.status}</td>
        <td>{row.has_geometry ? "✓" : "—"}</td>
        <td>{row.has_boundary ? "✓" : "—"}</td>
      </tr>)}</tbody>
    </table>
    <AdminPagination language={language} page={page} pageSize={pageSize} total={total} onPage={(next) => { setLoading(true); setPage(next); }} />
  </AdminTokenGate>;
}
