"use client";

import { useState } from "react";
import { AdminNav, AdminTokenGate, useAdminToken, type AdminLanguage } from "./AdminShell";

interface ImportIssue { section: string; index: number; path: string; message: string; }
type SectionCounts = { new: number; changed: number; unchanged: number; rejected: number };
interface ImportCounts {
  entities: SectionCounts;
  facts: SectionCounts & { conflict: number };
  evidence: SectionCounts;
}
interface ImportPlan {
  ok: boolean; checksum: string; issues: ImportIssue[]; counts: ImportCounts;
  duplicates: Array<{ kind: string; value: string; existing_code: string }>;
  rejected_rows: Array<{ section: string; index: number; code: string | null; reason: string }>;
  diff: Array<{ section: string; code: string; action: string; detail?: string }>;
}

/**
 * BATCH 13 — import.
 *
 * Dry run first, always: the payload is validated, duplicates are detected against the live database,
 * and a diff is shown. A commit must present the checksum of the previewed plan, so what is approved is
 * exactly what was seen. Rows claiming to be `verified` without an official, reachable source are
 * rejected rather than quietly downgraded — a silent downgrade would hide a data-quality problem.
 */
export function AdminImport({ language }: { language: AdminLanguage }) {
  const ar = language === "ar";
  const { token, setToken } = useAdminToken();
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [section, setSection] = useState<"entities" | "facts" | "evidence">("facts");
  const [payload, setPayload] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (mode: "dry_run" | "commit") => {
    setBusy(true); setError(""); setMessage("");
    try {
      const body: Record<string, unknown> = { mode, format, payload };
      if (format === "csv") body.section = section;
      if (mode === "commit") {
        if (!plan) throw new Error(ar ? "شغّل المعاينة أولًا." : "Run the dry run first.");
        body.preview_checksum = plan.checksum;
      }
      const response = await fetch("/api/admin/import", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as {
        ok?: boolean; mode?: string; plan?: ImportPlan; committed?: { entities: number; facts: number; evidence: number };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? `HTTP ${response.status}`);
      if (mode === "dry_run" && result.plan) {
        setPlan(result.plan);
        setMessage(ar ? "معاينة فقط — لم تُكتب أي صفوف." : "Dry run only — nothing was written.");
      } else if (result.committed) {
        setMessage(ar
          ? `أُضيفت ${result.committed.entities} كيانًا و${result.committed.facts} حقيقة و${result.committed.evidence} دليلًا كمرشّحات.`
          : `Inserted ${result.committed.entities} entities, ${result.committed.facts} facts and ${result.committed.evidence} evidence rows as candidates.`);
        setPlan(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally { setBusy(false); }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPayload(await file.text());
    setPlan(null);
    setMessage(ar ? `حُمّل ${file.name}` : `Loaded ${file.name}`);
  };

  return <AdminTokenGate language={language} token={token} setToken={setToken}>
    <AdminNav language={language} current="import" />
    <div className="admin-filters">
      <select value={format} onChange={(event) => { setFormat(event.target.value as "json" | "csv"); setPlan(null); }} aria-label={ar ? "الصيغة" : "Format"}>
        <option value="json">JSON</option>
        <option value="csv">CSV</option>
      </select>
      {format === "csv" && <select value={section} onChange={(event) => { setSection(event.target.value as typeof section); setPlan(null); }} aria-label={ar ? "القسم" : "Section"}>
        <option value="facts">{ar ? "حقائق" : "Facts"}</option>
        <option value="entities">{ar ? "كيانات" : "Entities"}</option>
        <option value="evidence">{ar ? "أدلة" : "Evidence"}</option>
      </select>}
      <input type="file" accept={format === "json" ? ".json,application/json" : ".csv,text/csv"} onChange={(event) => void onFile(event.target.files?.[0])}
        aria-label={ar ? "ملف" : "File"} />
    </div>
    <textarea className="admin-import-textarea" value={payload} onChange={(event) => { setPayload(event.target.value); setPlan(null); }}
      placeholder={format === "json" ? (ar ? "ألصق محتوى JSON بصيغة البذرة" : "Paste seed-format JSON") : (ar ? "ألصق محتوى CSV" : "Paste CSV")}
      aria-label={ar ? "المحتوى" : "Payload"} rows={10} spellCheck={false} />
    <div className="admin-actions">
      <button type="button" onClick={() => void send("dry_run")} disabled={busy || !payload.trim()}>{ar ? "معاينة (تجريبي)" : "Preview (dry run)"}</button>
      <button type="button" onClick={() => void send("commit")} disabled={busy || !plan}>{ar ? "اعتماد الاستيراد" : "Commit import"}</button>
    </div>
    {message && <p className="admin-notice" role="status">{message}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}

    {plan && <section aria-label={ar ? "نتيجة المعاينة" : "Preview result"} className="admin-import-plan">
      <h2>{ar ? "نتيجة المعاينة" : "Preview result"}</h2>
      <p><small>{ar ? "بصمة المحتوى" : "Payload checksum"}: <code>{plan.checksum}</code></small></p>
      {/* Each section is broken out by what would happen to it; a single total would hide
          the difference between "new", "unchanged" and "rejected", which is the whole point of a preview. */}
      <table className="admin-table">
        <caption>{ar ? "ما سيحدث لكل قسم" : "What would happen to each section"}</caption>
        <thead><tr>
          <th scope="col">{ar ? "القسم" : "Section"}</th>
          <th scope="col">{ar ? "جديد" : "New"}</th>
          <th scope="col">{ar ? "موجود سابقًا" : "Unchanged"}</th>
          <th scope="col">{ar ? "مختلف" : "Changed"}</th>
          <th scope="col">{ar ? "متعارض" : "Conflict"}</th>
          <th scope="col">{ar ? "مرفوض" : "Rejected"}</th>
        </tr></thead>
        <tbody>
          <tr>
            <th scope="row">{ar ? "كيانات" : "Entities"}</th>
            <td>{plan.counts.entities.new}</td><td>{plan.counts.entities.unchanged}</td>
            <td>{plan.counts.entities.changed}</td><td>—</td><td>{plan.counts.entities.rejected}</td>
          </tr>
          <tr>
            <th scope="row">{ar ? "حقائق" : "Facts"}</th>
            <td>{plan.counts.facts.new}</td><td>{plan.counts.facts.unchanged}</td>
            <td>{plan.counts.facts.changed}</td><td>{plan.counts.facts.conflict}</td><td>{plan.counts.facts.rejected}</td>
          </tr>
          <tr>
            <th scope="row">{ar ? "أدلة" : "Evidence"}</th>
            <td>{plan.counts.evidence.new}</td><td>{plan.counts.evidence.unchanged}</td>
            <td>{plan.counts.evidence.changed}</td><td>—</td><td>{plan.counts.evidence.rejected}</td>
          </tr>
        </tbody>
      </table>
      {plan.rejected_rows.length > 0 && <>
        <h3>{ar ? "صفوف مرفوضة" : "Rejected rows"}</h3>
        <table className="admin-table"><thead><tr>
          <th scope="col">{ar ? "القسم" : "Section"}</th><th scope="col">#</th>
          <th scope="col">{ar ? "الرمز" : "Code"}</th><th scope="col">{ar ? "السبب" : "Reason"}</th>
        </tr></thead><tbody>{plan.rejected_rows.map((row) => <tr key={`${row.section}-${row.index}`}>
          <td>{row.section}</td><td>{row.index + 1}</td><td><code>{row.code ?? "—"}</code></td><td>{row.reason}</td>
        </tr>)}</tbody></table>
      </>}
      {plan.duplicates.length > 0 && <>
        <h3>{ar ? "مكرر" : "Duplicates"}</h3>
        <ul>{plan.duplicates.map((duplicate) => <li key={`${duplicate.kind}-${duplicate.value}`}>
          <code>{duplicate.value}</code> · {duplicate.kind} · {ar ? "موجود كـ" : "already"} <code>{duplicate.existing_code}</code>
        </li>)}</ul>
      </>}
      {plan.issues.length > 0 && <>
        <h3>{ar ? "ملاحظات التحقق" : "Validation issues"}</h3>
        <ul>{plan.issues.slice(0, 50).map((issue) => <li key={`${issue.section}-${issue.index}-${issue.path}`}>
          <code>{issue.section}[{issue.index}].{issue.path}</code>: {issue.message}
        </li>)}</ul>
      </>}
      {plan.diff.length > 0 && <>
        <h3>{ar ? "الفروق" : "Diff"}</h3>
        <ul className="admin-diff">{plan.diff.slice(0, 100).map((line) => <li key={`${line.section}-${line.code}-${line.action}`}>
          <span className={`admin-chip is-${line.action}`}>{line.action}</span> <code>{line.code}</code> {line.detail ?? ""}
        </li>)}</ul>
      </>}
    </section>}
  </AdminTokenGate>;
}
