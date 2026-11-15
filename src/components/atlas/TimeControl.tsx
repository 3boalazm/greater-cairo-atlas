"use client";

import { CalendarClock, Pause, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { notDrawnReasonLabel, timelineDisagreementNote, undatedStatusLabel, type TimelineStatusResolution } from "@/lib/atlas/status-timeline";
import type { AtlasLanguage } from "./atlas-client";

/**
 * BATCH 14.1 — the «الزمن» control.
 *
 * Collapsed to one small button so the map is not cluttered for someone who never asked for a timeline.
 * Opening it reveals a slider, the year, and play/pause. Closing it returns the map to today's state,
 * because a hidden control must not leave the map in a past state the user cannot see.
 */
export function TimeControl({ language, year, minYear, maxYear, enabled, onChange, onToggle, undatedCount, withheldCount, className = "" }: {
  language: AtlasLanguage;
  year: number;
  minYear: number;
  maxYear: number;
  enabled: boolean;
  onChange: (year: number) => void;
  onToggle: (enabled: boolean) => void;
  /** Entities with no dated claim at the chosen year — drawn as unknown, never assumed operating. */
  undatedCount: number;
  /** Entities whose dated claim exists but is unreviewed, so it is reported but not drawn. */
  withheldCount: number;
  className?: string;
}) {
  const ar = language === "ar";
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Playback advances one year at a time and stops at the last year rather than looping. Looping would
  // make a screenshot of "the map in 2019" ambiguous, since it silently returns to the start.
  useEffect(() => {
    if (!playing || !enabled) return;
    timer.current = setInterval(() => {
      const next = Math.min(maxYear, year + 1);
      onChange(next);
      // Reaching the last year stops playback; the button reflects it on the next render.
      if (next >= maxYear) setPlaying(false);
    }, 900);
    return () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  }, [playing, enabled, year, maxYear, onChange]);

  // Closing the control must stop playback even if the parent unmounts the slider.
  if (!enabled && playing) setPlaying(false);

  if (!enabled) {
    return <button type="button" className={`time-control-toggle ${className}`} onClick={() => onToggle(true)}
      aria-expanded="false" title={ar ? "اعرض الخريطة في سنة مختارة" : "Show the map at a chosen year"}>
      <CalendarClock aria-hidden="true" /><span>{ar ? "الزمن" : "Time"}</span>
    </button>;
  }

  const isToday = year >= maxYear;
  return <div className={`time-control ${className}`} role="group" aria-label={ar ? "الزمن: حالة الخريطة في سنة" : "Time: map state at a year"}>
    <div className="time-control-head">
      <CalendarClock aria-hidden="true" />
      <strong className="time-control-year" aria-live="polite">{year}</strong>
      <button type="button" className="time-control-play" aria-pressed={playing}
        onClick={() => setPlaying((value) => !value)} disabled={year >= maxYear && !playing}
        title={ar ? (playing ? "إيقاف" : "تشغيل") : (playing ? "Pause" : "Play")}>
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        <span>{playing ? (ar ? "إيقاف" : "Pause") : (ar ? "تشغيل" : "Play")}</span>
      </button>
      <button type="button" className="time-control-close" onClick={() => { setPlaying(false); onToggle(false); }}
        aria-label={ar ? "إغلاق الزمن والعودة إلى اليوم" : "Close time and return to today"}>
        <X aria-hidden="true" />
      </button>
    </div>
    <input type="range" min={minYear} max={maxYear} step={1} value={year} dir="ltr"
      aria-label={ar ? "اختيار السنة" : "Choose the year"} aria-valuetext={`${year}`}
      onChange={(event) => { setPlaying(false); onChange(Number(event.target.value)); }} />
    <div className="time-control-scale" aria-hidden="true"><span>{minYear}</span><span>{ar ? "اليوم" : "Today"}</span></div>
    {isToday
      ? <p className="time-control-note">{ar ? "الخريطة كما هي اليوم." : "The map as it stands today."}</p>
      : <p className="time-control-note">{ar
        ? `${undatedCount.toLocaleString("en-US")} كيان بلا ادعاء مؤرخ قبل هذه السنة — يُعرض «${undatedStatusLabel(language)}».`
        : `${undatedCount.toLocaleString("en-US")} entities have no dated claim by this year — shown as "${undatedStatusLabel(language)}".`}</p>}
    {withheldCount > 0 && <p className="time-control-note is-muted">{ar
      ? `${withheldCount.toLocaleString("en-US")} ادعاء مؤرخ لم يُراجَع بعد؛ يُذكر في اللوحة ولا يغيّر لون الخريطة.`
      : `${withheldCount.toLocaleString("en-US")} dated claims are unreviewed; they are reported in the panel and do not recolour the map.`}</p>}
  </div>;
}

/**
 * The researcher-mode explanation of why one feature looks the way it does in the chosen year.
 *
 * This is the part that makes the slider trustworthy: it names the fact that decided the colour, or says
 * plainly that no dated claim existed, or that the claim was unreviewed. It never says "operating because
 * it opened in 2019" — because that sentence would be an inference the data does not support.
 */
export function TimelinePanelNote({ language, year, resolution, curatedStatus, onSelectFact }: {
  language: AtlasLanguage;
  year: number;
  resolution: TimelineStatusResolution | null;
  /** The stored status the panel would otherwise show, so a disagreement can be named. */
  curatedStatus: string;
  onSelectFact?: (factCode: string) => void;
}) {
  const ar = language === "ar";
  if (!resolution) {
    return <aside className="timeline-panel-note" aria-label={ar ? "الحالة في هذه السنة" : "Status in this year"}>
      <strong>{undatedStatusLabel(language)}</strong>
      <p>{ar ? `لا يوجد ادعاء حالة مؤرخ في ${year} أو قبله. لا يفترض الأطلس أن الكيان كان يعمل.`
        : `No dated status claim exists in or before ${year}. The atlas does not assume the entity was operating.`}</p>
    </aside>;
  }
  return <aside className="timeline-panel-note" aria-label={ar ? "الحالة في هذه السنة" : "Status in this year"}>
    <strong>{ar ? `في ${year}` : `In ${year}`}</strong>
    <p>
      {resolution.verification_state === "conflicted"
        ? (ar ? "ادعاءان متناقضان في التاريخ نفسه: لم ترجّح الخريطة أحدهما." : "Two contradicting claims on the same date: the map does not pick a winner.")
        : <>
          {ar ? "الأساس: " : "Deciding fact: "}
          {resolution.fact_code && onSelectFact
            ? <button type="button" className="timeline-fact-link" onClick={() => onSelectFact(resolution.fact_code!)}>{resolution.fact_code}</button>
            : <code>{resolution.fact_code ?? "—"}</code>}
          {" "}{ar ? "بتاريخ" : "as of"} <span dir="ltr">{resolution.valid_as_of}</span>
          {resolution.valid_as_of_precision !== "day" && <span className="timeline-precision"> · {ar ? (resolution.valid_as_of_precision === "year" ? "سنة" : "شهر") : resolution.valid_as_of_precision}</span>}
        </>}
    </p>
    {resolution.not_drawn_reason && <>
      <p className="is-muted">{notDrawnReasonLabel(language, resolution.not_drawn_reason)}</p>
      {resolution.reported_status && <p className="is-muted">{ar
        ? `الادعاء يقول «${resolution.reported_status}» لكنه لا يغيّر لون الخريطة.`
        : `The claim says "${resolution.reported_status}" but does not recolour the map.`}</p>}
    </>}
    {resolution.status !== "unknown" && resolution.status !== curatedStatus && (
      <p className="is-muted">{timelineDisagreementNote(language)}</p>
    )}
    {resolution.candidates.length > 1 && <ul className="timeline-candidates">
      {resolution.candidates.map((candidate) => <li key={candidate.fact_code}>
        <code>{candidate.fact_code}</code> · {candidate.value} · <span dir="ltr">{candidate.valid_as_of}</span> · {candidate.verification_state}
      </li>)}
    </ul>}
  </aside>;
}
