"use client";

/* eslint-disable react-hooks/set-state-in-effect -- server-side filtering is re-fetched whenever the filters change. */

import { useCallback, useEffect, useState } from "react";
import { AdminNav, AdminPagination, AdminTokenGate, useAdminToken, type AdminLanguage } from "./AdminShell";

interface EvidenceRow {
  code: string; title: string | null; url: string | null; publisher: string | null;
  source_type: string; published_date: string | null; accessed_date: string | null;
}
interface FactRow {
  code: string; entity_code: string; attribute: string; value: string; unit: string | null;
  valid_as_of: string | null; verification_state: string; review_state: string;
  review_reason: string | null; evidence: EvidenceRow[];
}

const STATE_LABELS: Record<string, { ar: string; en: string }> = {
  pending: { ar: "بانتظار المراجعة", en: "Pending" },
  approved: { ar: "معتمدة", en: "Approved" },
  rejected: { ar: "مرفوضة", en: "Rejected" },
  disputed: { ar: "متنازع عليها", en: "Disputed" },
};

const VERIFICATION_LABELS: Record<string, { ar: string; en: string }> = {
  verified: { ar: "موثّقة", en: "Verified" },
  candidate: { ar: "مرشّحة", en: "Candidate" },
  disputed: { ar: "متنازع عليها", en: "Disputed" },
  corroborated: { ar: "مدعومة", en: "Corroborated" },
  single_source: { ar: "مصدر واحد", en: "Single source" },
  superseded: { ar: "مُستبدلة", en: "Superseded" },
  rejected: { ar: "مرفوضة", en: "Rejected" },
};

/**
 * BATCH 13 — facts & evidence review.
 *
 * Each fact shows its value, as-of date, verification state and every linked evidence row. Actions
 * write an audit row; a rejection or dispute needs a written reason. When an approval cannot make the
 * claim `verified`, the server says why and that reason is shown — the UI never claims otherwise.
 */
export function AdminFacts({ language }: { language: AdminLanguage }) {
  const ar = language === "ar";
  const { token, setToken } = useAdminToken();
  const [rows, setRows] = useState<FactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [state, setState] = useState("pending");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyCode, setBusyCode] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [attaching, setAttaching] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const authHeaders = useCallback(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  // Starts with the request, so the effect never sets state synchronously.
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ facts: "1", state, page: String(page), page_size: "25" });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/admin/entities?${params}`, { headers: authHeaders() });
      const payload = await response.json() as { ok?: boolean; rows?: FactRow[]; total?: number; error?: { message?: string } };
      if (!response.ok || !payload.rows) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      setRows(payload.rows); setTotal(payload.total ?? 0); setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally { setLoading(false); }
  }, [authHeaders, state, page, query]);

  useEffect(() => { if (token) void load(); }, [token, load]);

  const act = async (factCode: string, body: Record<string, unknown>) => {
    setBusyCode(factCode); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/review/${encodeURIComponent(factCode)}`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(body),
      });
      const payload = await response.json() as {
        ok?: boolean; error?: { message?: string };
        result?: { review_state: string; verification_state: string; verification_unchanged_reason: string | null };
      };
      if (!response.ok || !payload.result) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      setNotice(payload.result.verification_unchanged_reason
        ? (ar ? `حُفظ القرار. لم تُرقَّ الحقيقة إلى «موثّقة»: ${payload.result.verification_unchanged_reason}`
          : `Decision saved. The claim was not marked verified: ${payload.result.verification_unchanged_reason}`)
        : (ar ? "حُفظ القرار وسُجّل في سجل التدقيق." : "Decision saved and written to the audit log."));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally { setBusyCode(""); }
  };

  return <AdminTokenGate language={language} token={token} setToken={setToken} onAuthenticated={load}>
    <AdminNav language={language} current="facts" />
    <div className="admin-filters">
      <input type="search" value={query} onChange={(event) => { setLoading(true); setPage(1); setQuery(event.target.value); }}
        placeholder={ar ? "ابحث برمز الحقيقة أو اسم الكيان" : "Search fact code or entity name"} aria-label={ar ? "بحث" : "Search"} />
      <select value={state} onChange={(event) => { setLoading(true); setPage(1); setState(event.target.value); }} aria-label={ar ? "حالة المراجعة" : "Review state"}>
        {Object.entries(STATE_LABELS).map(([key, label]) => <option key={key} value={key}>{ar ? label.ar : label.en}</option>)}
        <option value="all">{ar ? "الكل" : "All"}</option>
      </select>
    </div>
    {loading && <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}

    <ul className="admin-fact-list">{rows.map((fact) => <li key={fact.code} className="admin-fact-card">
      <div className="admin-fact-head">
        <code>{fact.code}</code>
        <span className="admin-chip">{fact.entity_code}</span>
        <span className={`admin-chip is-${fact.review_state}`}>{STATE_LABELS[fact.review_state]?.[language] ?? fact.review_state}</span>
        <span className={`admin-chip is-verification-${fact.verification_state}`}>{VERIFICATION_LABELS[fact.verification_state]?.[language] ?? fact.verification_state}</span>
      </div>
      <p className="admin-fact-value"><strong>{fact.attribute}</strong>: {fact.value}{fact.unit ? ` ${fact.unit}` : ""}
        {fact.valid_as_of && <small> · {ar ? "بتاريخ" : "as of"} {fact.valid_as_of}</small>}</p>
      {fact.review_reason && <p className="admin-fact-reason">{ar ? "سبب القرار السابق" : "Previous reason"}: {fact.review_reason}</p>}

      <details className="admin-evidence">
        <summary>{ar ? `الأدلة (${fact.evidence.length})` : `Evidence (${fact.evidence.length})`}</summary>
        {fact.evidence.length === 0
          ? <p className="admin-empty">{ar ? "لا يوجد دليل مرتبط بهذه الحقيقة." : "No evidence is linked to this fact."}</p>
          : <ul>{fact.evidence.map((item) => <li key={item.code}>
            <strong>{item.title ?? item.code}</strong> · {item.publisher ?? "—"} · <span className={`admin-chip is-source-${item.source_type}`}>{item.source_type}</span>
            <br />
            {item.url
              ? <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a>
              : <span className="admin-missing-url">{ar ? "بلا رابط — لا يمكن أن تؤدي إلى «موثّقة»" : "No URL — cannot make a fact verified"}</span>}
            <br /><small>{ar ? "نُشر" : "Published"}: {item.published_date ?? "—"} · {ar ? "تاريخ الوصول" : "Accessed"}: {item.accessed_date ?? "—"}</small>
          </li>)}</ul>}
      </details>

      <div className="admin-actions">
        <button type="button" onClick={() => void act(fact.code, { action: "approve" })} disabled={busyCode === fact.code}>
          {ar ? "اعتماد" : "Approve"}
        </button>
        <button type="button" className="is-danger" onClick={() => void act(fact.code, { action: "reject", reason: reasons[fact.code] ?? "" })} disabled={busyCode === fact.code}>
          {ar ? "رفض" : "Reject"}
        </button>
        <button type="button" onClick={() => void act(fact.code, { action: "dispute", reason: reasons[fact.code] ?? "" })} disabled={busyCode === fact.code}>
          {ar ? "تحديد كتعارض" : "Mark disputed"}
        </button>
        <input value={reasons[fact.code] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [fact.code]: event.target.value }))}
          placeholder={ar ? "سبب الرفض أو التعارض (مطلوب)" : "Reason for reject/dispute (required)"} aria-label={ar ? "السبب" : "Reason"} />
        <input value={attaching[fact.code] ?? ""} onChange={(event) => setAttaching((current) => ({ ...current, [fact.code]: event.target.value }))}
          placeholder={ar ? "رمز دليل لإرفاقه" : "Evidence code to attach"} aria-label={ar ? "رمز الدليل" : "Evidence code"} />
        <button type="button" onClick={() => void act(fact.code, { attach: { stance: "supporting", evidence_code: attaching[fact.code] ?? "", reason: reasons[fact.code] || (ar ? "دليل مؤيد" : "Supporting evidence") } })} disabled={busyCode === fact.code || !(attaching[fact.code] ?? "").trim()}>
          {ar ? "إرفاق مؤيد" : "Attach supporting"}
        </button>
        <button type="button" onClick={() => void act(fact.code, { attach: { stance: "contradicting", evidence_code: attaching[fact.code] ?? "", reason: reasons[fact.code] || (ar ? "دليل معارض" : "Contradicting evidence") } })} disabled={busyCode === fact.code || !(attaching[fact.code] ?? "").trim()}>
          {ar ? "إرفاق معارض" : "Attach contradicting"}
        </button>
      </div>
    </li>)}</ul>
    {!loading && rows.length === 0 && <p className="admin-empty">{ar ? "لا توجد حقائق في هذه الحالة." : "No facts in this state."}</p>}
    <AdminPagination language={language} page={page} pageSize={25} total={total} onPage={(next) => { setLoading(true); setPage(next); }} />
  </AdminTokenGate>;
}
