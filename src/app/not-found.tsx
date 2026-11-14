import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

export default function NotFound() {
  return <div className="site-layout" lang="ar" dir="rtl">
    <SiteHeader language="ar" />
    <main className="site-content" id="main-content">
      <p className="site-eyebrow">404</p>
      <h1>الصفحة غير موجودة</h1>
      <p className="site-lede">قد يكون الرابط قديمًا أو أن الصفحة غير متاحة. يمكنك العودة إلى الخريطة أو استكشاف البيانات.</p>
      <p className="site-backlink"><Link href="/">العودة إلى الخريطة ←</Link> · <Link href="/data">البيانات ←</Link></p>
    </main>
    <SiteFooter language="ar" />
  </div>;
}
