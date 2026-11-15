"use client";

import { useState, type FormEvent } from "react";

export function SuggestionForm({ entityCode, attributes, language }: { entityCode: string; attributes: string[]; language: "ar" | "en" }) {
  const ar = language === "ar";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [website, setWebsite] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage(""); setSuccess(false);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = { entity_code: entityCode, attribute: String(form.get("attribute") ?? "").trim(), proposed_value: String(form.get("proposed_value") ?? "").trim(), source_url: String(form.get("source_url") ?? "").trim(), note: String(form.get("note") ?? "").trim(), email: String(form.get("email") ?? "").trim(), website };
    try {
      const response = await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? (ar ? "تعذر إرسال الاقتراح." : "Could not submit suggestion."));
      setSuccess(true); setMessage(ar ? "شكرًا لك. أُرسل اقتراحك للمراجعة البشرية؛ لن تتغير الحقائق تلقائيًا." : "Thank you. Your suggestion was sent for human review; facts will not change automatically.");
      formElement.reset(); setWebsite("");
    } catch (error) { setMessage(error instanceof Error ? error.message : (ar ? "تعذر إرسال الاقتراح." : "Could not submit suggestion.")); }
    finally { setBusy(false); }
  };
  return <form className="suggestion-form" onSubmit={submit}>
    <label>{ar ? "السمة" : "Attribute"}<input name="attribute" list={`attributes-${entityCode}`} required maxLength={120} pattern="[a-z][a-z0-9_]{0,119}" placeholder="operational_status"/><datalist id={`attributes-${entityCode}`}>{attributes.map((attribute) => <option key={attribute} value={attribute}/>)}</datalist></label>
    <label>{ar ? "القيمة المقترحة" : "Proposed value"}<input name="proposed_value" required maxLength={1000}/></label>
    <label>{ar ? "رابط المصدر (مطلوب)" : "Source URL (required)"}<input name="source_url" type="url" required maxLength={2048} placeholder="https://…" dir="ltr"/></label>
    <label>{ar ? "ملاحظة" : "Note"}<textarea name="note" maxLength={1000} rows={3}/></label>
    <label>{ar ? "البريد الإلكتروني (اختياري)" : "Email (optional)"}<input name="email" type="email" maxLength={254} autoComplete="email"/></label>
    <label className="submission-honeypot" aria-hidden="true">Leave this blank<input name="website" value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off"/></label>
    <button type="submit" disabled={busy}>{busy ? (ar ? "جارٍ الإرسال…" : "Sending…") : (ar ? "إرسال للمراجعة" : "Send for review")}</button>
    {message && <p role="status" className={success ? "submission-success" : "submission-error"}>{message}</p>}
  </form>;
}
