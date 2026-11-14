"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error("Unhandled atlas route error:", error), [error]);
  return <div className="site-layout" lang="ar" dir="rtl">
    <SiteHeader language="ar" />
    <main className="site-content" id="main-content" role="alert">
      <p className="site-eyebrow">تعذّر إكمال الطلب</p>
      <h1>حدث خطأ غير متوقع</h1>
      <p className="site-lede">لم تُحذف البيانات أو تُعدّل بسبب هذا الخطأ. حاول مجددًا أو عد إلى الصفحة الرئيسية.</p>
      {error.digest && <p className="entity-code">مرجع الخطأ: <code>{error.digest}</code></p>}
      <p><button type="button" className="atlas-icon-button" onClick={reset}>إعادة المحاولة</button></p>
      <p className="site-backlink"><Link href="/">العودة إلى الخريطة ←</Link></p>
    </main>
    <SiteFooter language="ar" />
  </div>;
}
