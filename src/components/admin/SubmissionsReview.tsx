"use client";

import { useState } from "react";

interface Submission { id: string; entity_code: string; attribute: string; proposed_value: string; source_url: string; note: string; email: string | null; status: string; reviewer_note: string | null; created_at: string; }

export function SubmissionsReview({ language }: { language: "ar" | "en" }) {
  const ar = language === "ar";
  const [token, setToken] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const request = async (url: string, init: RequestInit = {}) => fetch(url, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers } });
  const load = async () => {
    if (!token.trim()) { setMessage(ar ? "أدخل رمز الإدارة." : "Enter the admin token."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await request("/api/admin/submissions");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      setSubmissions(payload.submissions); setMessage(ar ? `تم تحميل ${payload.submissions.length} اقتراحًا.` : `Loaded ${payload.submissions.length} suggestions.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed"); }
    finally { setBusy(false); }
  };
  const review = async (id: string, status: "accepted" | "rejected") => {
    setBusy(true);
    try {
      const response = await request(`/api/admin/submissions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status, reviewer_note: reviewNotes[id] ?? "" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      setSubmissions((rows) => rows.map((row) => row.id === id ? payload.submission : row));
      setMessage(ar ? "حُفظ القرار للمراجعة فقط؛ لم تتغير أي حقيقة." : "Review decision saved only; no fact was changed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed"); }
    finally { setBusy(false); }
  };
  const exportReview = async () => {
    try {
      const response = await request("/api/admin/submissions/export");
      if (!response.ok) throw new Error((await response.json()).error?.message ?? `HTTP ${response.status}`);
      const blob = await response.blob(); const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = "accepted-submissions-review.json"; anchor.click(); URL.revokeObjectURL(href);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed"); }
  };
  return <section className="submission-admin">
    <p className="site-lede">{ar ? "أدخل رمز الإدارة لإظهار الاقتراحات المعلقة. يُرسل الرمز في ترويسة Authorization فقط ولا يُحفظ في الرابط أو التخزين المحلي." : "Enter the admin token to load submissions. It is sent only in the Authorization header and never stored in the URL or local storage."}</p>
    <form onSubmit={(event) => { event.preventDefault(); void load(); }} className="submission-admin-auth">
      <label>{ar ? "رمز الإدارة" : "Admin token"}<input type="password" value={token} autoComplete="off" onChange={(event) => setToken(event.target.value)} /></label>
      <button type="submit" disabled={busy}>{busy ? (ar ? "جارٍ التحميل…" : "Loading…") : (ar ? "تحميل الطلبات" : "Load submissions")}</button>
      <button type="button" onClick={() => void exportReview()} disabled={busy || !token}>{ar ? "تصدير المقبول للمراجعة البحثية" : "Export accepted for research review"}</button>
    </form>
    {message && <p role="status" className="submission-admin-message">{message}</p>}
    <div className="submission-admin-list">{submissions.map((item) => <article key={item.id}>
      <header><strong>{item.entity_code} · {item.attribute}</strong><span className={`submission-state submission-${item.status}`}>{item.status}</span></header>
      <p><strong>{ar ? "القيمة المقترحة:" : "Proposed value:"}</strong> {item.proposed_value}</p>
      <p><strong>{ar ? "المصدر:" : "Source:"}</strong> <a href={item.source_url} target="_blank" rel="noreferrer">{item.source_url}</a></p>
      {item.note && <p>{item.note}</p>}{item.email && <p>{ar ? "البريد:" : "Email:"} {item.email}</p>}
      <small>{item.created_at}</small>
      <label>{ar ? "ملاحظة المراجع" : "Reviewer note"}<textarea maxLength={1000} value={reviewNotes[item.id] ?? item.reviewer_note ?? ""} onChange={(event) => setReviewNotes((notes) => ({ ...notes, [item.id]: event.target.value }))} /></label>
      {item.status === "pending" && <div className="submission-review-actions"><button disabled={busy} onClick={() => void review(item.id, "accepted")}>{ar ? "قبول للمراجعة البحثية فقط" : "Accept for research review only"}</button><button disabled={busy} onClick={() => void review(item.id, "rejected")}>{ar ? "رفض" : "Reject"}</button></div>}
    </article>)}</div>
  </section>;
}
