import Link from "next/link";
import type { AtlasEntityFact } from "./atlas-client";
import { VERIFICATION_LABELS, translateLabel } from "@/lib/atlas/labels";

function isStatusFact(attribute: string) { return /(?:^|_)(?:status|lifecycle)$|^operational_status$/i.test(attribute); }

export function EntityTimeline({ facts, language }: { facts: AtlasEntityFact[]; language: "ar" | "en" }) {
  const ar = language === "ar";
  const dated = facts.filter((fact) => isStatusFact(fact.attribute) && fact.valid_as_of)
    .sort((a, b) => (a.valid_as_of ?? "").localeCompare(b.valid_as_of ?? "") || a.code.localeCompare(b.code));
  const rows = dated.map((fact, index) => {
    const status = fact.attribute === "operational_status";
    const previous = status ? dated.slice(0, index).reverse().find((candidate) => candidate.attribute === "operational_status" && candidate.valid_as_of! < fact.valid_as_of! && !["superseded", "rejected"].includes(candidate.verification_state))?.value ?? null : null;
    const date = fact.valid_as_of!.slice(0, fact.valid_as_of_precision === "day" ? 10 : fact.valid_as_of_precision === "month" ? 7 : 4);
    return { fact, status, previous, date };
  });
  return <section className="entity-timeline" aria-label={ar ? "التسلسل الزمني" : "Timeline"}>
    <div className="timeline-heading"><span className="section-index">{ar ? "الزمن" : "TIME"}</span><div><h3>{ar ? "التسلسل الزمني" : "Timeline"}</h3><p>{ar ? "حقائق الحالة المؤرخة فقط؛ لا تُضاف تواريخ أو انتقالات مستنتجة." : "Only dated status facts; no dates or transitions are inferred."}</p></div></div>
    {rows.length ? <ol>{rows.map(({ fact, status, previous, date }) => <li key={fact.code} className={`timeline-item timeline-${fact.verification_state}`}>
      <time dateTime={fact.valid_as_of!}>{date}{fact.valid_as_of_precision !== "day" ? ` · ${ar ? (fact.valid_as_of_precision === "month" ? "شهر" : "سنة") : `${fact.valid_as_of_precision} precision`}` : ""}</time>
      <div><strong>{status && previous && previous !== fact.value ? `${previous} → ${fact.value}` : fact.value}{fact.unit ? ` ${fact.unit}` : ""}</strong>
        <span>{fact.attribute.replaceAll("_", " ")}</span>
        <span className={`verification-badge verification-${fact.verification_state}`}>{translateLabel(VERIFICATION_LABELS, fact.verification_state, language)}</span>
        {(fact.verification_state === "superseded" || fact.verification_state === "rejected" || fact.verification_state === "disputed") && <small>{ar ? (fact.verification_state === "superseded" ? "ادعاء مستبدل" : fact.verification_state === "rejected" ? "ادعاء مرفوض" : "ادعاء متنازع عليه") : `${fact.verification_state} claim`}</small>}
        {fact.notes && <p>{fact.notes}</p>}
        {fact.evidence.map((evidence) => <Link key={evidence.code} href={`/sources/${encodeURIComponent(evidence.code)}?lang=${language}`}>{evidence.code}</Link>)}
      </div>
    </li>)}</ol> : <p className="quiet-note">{ar ? "لا توجد حقائق حالة مؤرخة في السجل." : "No dated status facts are recorded."}</p>}
  </section>;
}
