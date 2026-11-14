import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader, resolveLanguage } from "@/components/site/SiteChrome";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";

export const metadata: Metadata={title:"Sources | Greater Cairo Atlas",description:"Source directory for Greater Cairo Atlas entities, including publishers, source types, dates, and citations."};

export default async function SourcesPage({searchParams}:{searchParams:Promise<{lang?:string|string[]}>}){
 const language=resolveLanguage((await searchParams).lang);const ar=language==="ar";const data=await getStaticAtlasDataset();
 const publisherCounts=new Map<string,{count:number;types:Set<string>}>();
 for(const source of data.evidence){const publisher=source.publisher||"Unknown publisher";const current=publisherCounts.get(publisher)??{count:0,types:new Set<string>()};current.count++;current.types.add(source.source_type);publisherCounts.set(publisher,current);}
 const typeNames:Record<string,{ar:string;en:string}>={official:{ar:"رسمي",en:"official"},news:{ar:"إخباري",en:"news"},secondary:{ar:"ثانوي",en:"secondary"},dataset:{ar:"مجموعة بيانات",en:"dataset"},map:{ar:"خرائط",en:"map"},pdf:{ar:"ملف PDF",en:"PDF"}};
 const sorted=[...publisherCounts.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
 return <div className="site-layout" lang={language} dir={ar?"rtl":"ltr"}><SiteHeader language={language}/><main className="site-content document-page" id="main-content">
  <p className="site-eyebrow">{ar?"دليل الإسناد":"CITATION DIRECTORY"}</p><h1>{ar?"المصادر والناشرون":"Sources & publishers"}</h1>
  <p className="site-lede">{ar?"فهرس للناشرين ومجموعات الأدلة المستخدمة في الحقائق. نوع المصدر ظاهر، خصوصًا المصادر الثانوية، وتظهر تفاصيل كل دليل في صفحة الكيان المرتبطة به.":"An index of publishers and evidence records used for atlas facts. Source types are identified—including secondary sources—and each citation’s details appear on its linked entity page."}</p>
  <div className="source-index-summary"><strong>{data.evidence.length.toLocaleString()}</strong><span>{ar?"سجل دليل":"evidence records"}</span><strong>{sorted.length.toLocaleString()}</strong><span>{ar?"ناشرًا":"publishers"}</span></div>
  <div className="publisher-index">{sorted.map(([publisher,entry])=><article key={publisher}><h2>{publisher}</h2><div><span>{entry.count.toLocaleString()} {ar?"دليل":"evidence items"}</span>{[...entry.types].sort().map(type=><span className={`source-type-pill source-${type}`} key={type}>{ar?(typeNames[type]?.ar??type):type.replaceAll("_"," ")}{type==="secondary"?` · ${ar?"ثانوي":"secondary"}`:""}</span>)}</div></article>)}</div>
  <section className="license-block"><h2>{ar?"إسناد البيانات الجغرافية":"Geodata attribution"}</h2><p>© OpenStreetMap contributors, ODbL 1.0 · OpenFreeMap</p><p>{ar?"تتطلب إعادة توزيع الهندسات المشتقة إبقاء إشعار ODbL. ولا يحدد المستودع ترخيصًا شاملًا للحقائق والأدلة؛ القرار للمالك.":"Redistribution of derived geometry must retain the ODbL notice. The repository does not define a blanket facts/evidence license; that decision remains with the data owner."}</p></section>
  <p className="site-backlink"><Link href={`/methodology?lang=${language}`}>{ar?"اقرأ المنهجية وسياسة التحقق ←":"Read the methodology and verification policy →"}</Link></p>
 </main><SiteFooter language={language}/></div>;
}
