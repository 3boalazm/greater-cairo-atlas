"use client";
/* eslint-disable react-hooks/set-state-in-effect -- first-visit state is read from localStorage during client hydration. */
import { useCallback, useEffect, useRef, useState } from "react";

export function FirstVisitGuide({ language }: { language: "ar" | "en" }) {
  const ar = language === "ar";
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dismiss = useCallback(() => {
    setOpen(false);
    try { localStorage.setItem("gca-guide-seen", "true"); } catch { /* Optional preference. */ }
    triggerRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); dismiss(); return; }
      if (event.key !== "Tab") return;
      const modal = closeRef.current?.closest("[role=dialog]");
      const focusable = modal ? [...modal.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')] : [];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);
  useEffect(() => {
    try { if (!localStorage.getItem("gca-guide-seen")) setOpen(true); } catch { /* Guide can still be opened with the button. */ }
  }, []);
  const pages = ar ? [
    { title: "خريطة القاهرة الكبرى", body: "مكان واحد يجمع الطرق والمدن ووسائل النقل." },
    { title: "ألوان الحالة", body: "أزرق: يعمل · أصفر: يعمل جزئيًا · برتقالي: تحت الإنشاء · بنفسجي: مخطط." },
    { title: "ابحث بسهولة", body: "اكتب اسم مكان أو محطة، ثم اختر النتيجة." },
  ] : [
    { title: "A map of Greater Cairo", body: "Roads, cities and transit in one place." },
    { title: "Status colours", body: "Blue: operating · yellow: partly operating · orange: building · purple: planned." },
    { title: "Search simply", body: "Type a place or station name and choose a result." },
  ];
  return <>
    <button ref={triggerRef} type="button" className="guide-help-button" aria-label={ar ? "إعادة عرض دليل الاستخدام" : "Show the getting-started guide"} title={ar ? "مساعدة" : "Help"} onClick={() => { setStep(0); setOpen(true); }}>؟</button>
    {open && <div className="guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section className="first-visit-guide" role="dialog" aria-modal="true" aria-labelledby="guide-title" dir={ar ? "rtl" : "ltr"}>
        <button ref={closeRef} type="button" className="guide-close" onClick={dismiss} aria-label={ar ? "إغلاق" : "Close guide"}>×</button>
        <span className="guide-step">{step + 1} / 3</span><h2 id="guide-title">{pages[step]!.title}</h2><p>{pages[step]!.body}</p>
        <div className="guide-progress" aria-hidden="true">{pages.map((_, index) => <i key={index} className={index === step ? "is-current" : ""}/>)}</div>
        <div className="guide-actions">{step > 0 && <button type="button" className="guide-secondary" onClick={() => setStep((current) => current - 1)}>{ar ? "السابق" : "Back"}</button>}
          {step < 2 ? <button type="button" onClick={() => setStep((current) => current + 1)}>{ar ? "التالي" : "Next"}</button> : <button type="button" onClick={dismiss}>{ar ? "ابدأ الاستكشاف" : "Start exploring"}</button>}</div>
      </section>
    </div>}
  </>;
}
