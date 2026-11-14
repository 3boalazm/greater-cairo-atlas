import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityMap } from "@/components/atlas/EntityMap";
import { SiteFooter, SiteHeader, getSiteUrl, resolveLanguage } from "@/components/site/SiteChrome";
import { getStaticEntityPageData } from "@/lib/atlas/static-dataset";
import type { AtlasFeatureCollection } from "@/components/atlas/atlas-client";

interface EntityPageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}

const labels = {
  ar: {
    entity: "صفحة الكيان", aliases: "أسماء بديلة", type: "النوع", sector: "النطاق الجغرافي", status: "الحالة المسجلة",
    asOf: "أحدث تاريخ مرجعي للحالة", statusDateMissing: "لا يوجد تاريخ مرجعي صريح للحالة في الحقائق المتاحة.",
    map: "الهندسة المسجلة", notMapped: "لا توجد هندسة موثقة لهذا الكيان حتى الآن.", facts: "الحقائق", conflicts: "القيم المتعددة أو المتعارضة معروضة جنبًا إلى جنب.",
    noFacts: "لا توجد حقائق مسجلة لهذا الكيان.", sources: "المصادر المرتبطة", noSources: "لا توجد مصادر مرتبطة.",
    published: "تاريخ النشر", accessed: "تاريخ الاطلاع", secondary: "مصدر ثانوي", back: "العودة إلى الخريطة", code: "الرمز",
    generated: "عُرضت هذه الصفحة بتاريخ", sectorLabels: { NORTH:"الشمال", EAST:"الشرق", SOUTH:"الجنوب", WEST:"الغرب", CENTRAL:"الوسط", REGIONAL:"إقليمي" } as Record<string,string>,
  },
  en: {
    entity: "Entity profile", aliases: "Aliases", type: "Type", sector: "Geographic sector", status: "Recorded status",
    asOf: "Latest status reference date", statusDateMissing: "No explicit status reference date is present in the available facts.",
    map: "Recorded geometry", notMapped: "No documented geometry is available for this entity yet.", facts: "Facts", conflicts: "Multiple or conflicting claims are shown side by side.",
    noFacts: "No facts are recorded for this entity.", sources: "Linked sources", noSources: "No linked sources.",
    published: "Published", accessed: "Accessed", secondary: "Secondary source", back: "Back to map", code: "Code",
    generated: "This page was rendered on", sectorLabels: { NORTH:"North", EAST:"East", SOUTH:"South", WEST:"West", CENTRAL:"Central", REGIONAL:"Regional" } as Record<string,string>,
  },
} as const;

const statusLabels: Record<string,{ar:string;en:string}> = {
  operational:{ar:"يعمل",en:"Operational"}, partial:{ar:"يعمل جزئيًا",en:"Partial"},
  under_construction:{ar:"قيد الإنشاء",en:"Under construction"}, planned:{ar:"مخطط",en:"Planned"},
  approved_planned:{ar:"مخطط ومعتمد",en:"Approved planned"}, unknown:{ar:"غير معلوم",en:"Unknown"},
};
const verificationLabels: Record<string,{ar:string;en:string}> = {
  candidate:{ar:"مرشح",en:"Candidate"}, single_source:{ar:"مصدر واحد",en:"Single source"},
  corroborated:{ar:"مؤيد بمصادر",en:"Corroborated"}, verified:{ar:"موثّق",en:"Verified"},
  disputed:{ar:"متنازع عليه",en:"Disputed"}, rejected:{ar:"مرفوض",en:"Rejected"}, superseded:{ar:"مستبدل",en:"Superseded"},
};
const entityTypeLabels: Record<string,{ar:string;en:string}> = {
  city:{ar:"مدينة",en:"City"}, district:{ar:"حي",en:"District"}, neighborhood:{ar:"حيّ/جوار",en:"Neighborhood"},
  road:{ar:"طريق",en:"Road"}, bridge:{ar:"كوبري",en:"Bridge"}, interchange:{ar:"تقاطع",en:"Interchange"}, tunnel:{ar:"نفق",en:"Tunnel"},
  transit_line:{ar:"خط نقل",en:"Transit line"}, transit_stop:{ar:"محطة نقل",en:"Transit stop"}, rail_station:{ar:"محطة سكك حديدية",en:"Rail station"},
  airport:{ar:"مطار",en:"Airport"}, project:{ar:"مشروع",en:"Project"}, authority:{ar:"جهة/هيئة",en:"Authority"}, landmark:{ar:"مَعلم",en:"Landmark"},
  facility:{ar:"منشأة",en:"Facility"}, waterway:{ar:"مجرى مائي",en:"Waterway"}, utility:{ar:"مرفق",en:"Utility"},
};
const sourceTypeLabels: Record<string,{ar:string;en:string}> = {
  official:{ar:"رسمي",en:"Official"}, news:{ar:"أخبار",en:"News"}, dataset:{ar:"مجموعة بيانات",en:"Dataset"},
  map:{ar:"خريطة",en:"Map"}, pdf:{ar:"ملف PDF",en:"PDF"}, secondary:{ar:"ثانوي",en:"Secondary"},
};

export async function generateMetadata({ params, searchParams }: EntityPageProps): Promise<Metadata> {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const language = resolveLanguage(query.lang);
  const entity = await getStaticEntityPageData(code);
  if (!entity) return { title: language === "ar" ? "الكيان غير موجود" : "Entity not found", robots: { index:false, follow:false } };
  const name = language === "ar" ? entity.name_ar : entity.name_en;
  const canonical = `${getSiteUrl()}/entity/${encodeURIComponent(entity.code)}`;
  const description = language === "ar"
    ? `${entity.name_ar} (${entity.name_en}): الحالة المسجلة والحقائق ومصادرها والهندسة المتاحة في أطلس القاهرة الكبرى.`
    : `${entity.name_en} (${entity.name_ar}): documented status, facts, sources, and available geometry in the Greater Cairo Atlas.`;
  return {
    title: name,
    description,
    alternates: { canonical, languages: { ar: canonical, en: `${canonical}?lang=en` } },
    openGraph: { type:"article", title:`${name} · Greater Cairo Atlas`, description, url:canonical, locale:language === "ar" ? "ar_EG" : "en_US", alternateLocale:language === "ar" ? "en_US" : "ar_EG" },
  };
}

export default async function EntityPage({ params, searchParams }: EntityPageProps) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const language=resolveLanguage(query.lang);
  const ar=language === "ar";
  const text=labels[language];
  const entity=await getStaticEntityPageData(code);
  if (!entity) notFound();

  const groups=new Map<string,typeof entity.facts>();
  for (const fact of entity.facts) groups.set(fact.attribute,[...(groups.get(fact.attribute) ?? []),fact]);
  const sources=new Map(entity.facts.flatMap((fact)=>fact.evidence.map((source)=>[source.code,source] as const)));
  const statusDates=entity.facts.filter((fact)=>/status|lifecycle/i.test(fact.attribute) && fact.valid_as_of).map((fact)=>fact.valid_as_of!).sort();
  const statusAsOf=statusDates.at(-1) ?? null;
  const now=new Date().toISOString().slice(0,10);
  const canonical=`${getSiteUrl()}/entity/${encodeURIComponent(entity.code)}`;
  const placeJsonLd={
    "@context":"https://schema.org","@type":"Place","@id":`${canonical}#place`,"url":canonical,
    "name":entity.name_en,"alternateName":entity.name_ar,"identifier":entity.code,
    ...(entity.mapGeometry ? { description:entity.description ?? undefined } : {}),
  };
  const safeJsonLd=JSON.stringify(placeJsonLd).replaceAll("<","\\u003c");
  const mapFeatures:AtlasFeatureCollection={type:"FeatureCollection",features:entity.mapGeometry?[{
    type:"Feature",id:`ENTITY-MAP-${entity.code}`,geometry:entity.mapGeometry,
    properties:{code:`ENTITY-MAP-${entity.code}`,entity_code:entity.code,name_ar:entity.name_ar,name_en:entity.name_en,type:entity.entity_type,status:entity.status,license:entity.mapLicense,attribution:entity.mapAttribution,source:"Source geometries, merged and simplified for display",retrieval_date:"",source_ids:[]},
  }]:[]};

  return <div className="site-layout" lang={language} dir={ar?"rtl":"ltr"}>
    <SiteHeader language={language}/>
    <main className="site-content entity-page">
      <nav className="breadcrumbs" aria-label={ar?"مسار التنقل":"Breadcrumbs"}><Link href="/">{text.back}</Link><span aria-hidden="true">/</span><span>{text.entity}</span></nav>
      <section className="entity-hero">
        <div><p className="site-eyebrow">{text.entity} · {entityTypeLabels[entity.entity_type]?.[language] ?? entity.entity_type.replaceAll("_"," ")}</p>
          <h1>{entity.name_ar}<span lang="en" dir="ltr">{entity.name_en}</span></h1>
          <p className="entity-code">{text.code}: <code>{entity.code}</code></p>
        </div>
        <div className="entity-hero-status"><span>{text.status}</span><strong className={`status-pill status-${entity.status}`}>{statusLabels[entity.status]?.[language] ?? entity.status}</strong>
          {statusAsOf ? <small>{text.asOf}: <time dateTime={statusAsOf}>{statusAsOf}</time></small> : <small>{text.statusDateMissing}</small>}
        </div>
      </section>
      <dl className="entity-factsheet">
        <div><dt>{text.type}</dt><dd>{entityTypeLabels[entity.entity_type]?.[language] ?? entity.entity_type.replaceAll("_"," ")}</dd></div>
        <div><dt>{text.sector}</dt><dd>{text.sectorLabels[entity.sector] ?? entity.sector}</dd></div>
        <div><dt>{text.aliases}</dt><dd>{entity.aliases.length?entity.aliases.join(" · "):"—"}</dd></div>
        <div><dt>{ar?"لقطة السجل":"Record snapshot"}</dt><dd><time dateTime={now}>{now}</time></dd></div>
      </dl>
      {entity.description && <p className="entity-long-description">{entity.description}</p>}
      <section className="entity-section" aria-labelledby="entity-map-heading">
        <div className="section-title"><span>01</span><div><h2 id="entity-map-heading">{text.map}</h2><p>{ar?"عرض تقريبي للهندسة المسجلة؛ لا تُنشأ وصلات غير موجودة في المصدر.":"A view of recorded source geometry; no connectors are invented."}</p></div></div>
        {entity.mapGeometry ? <><EntityMap features={mapFeatures} language={language} attribution={entity.mapAttribution}/><p className="map-data-attribution">{entity.mapAttribution} · OpenFreeMap</p></> : <p className="not-mapped-note">{text.notMapped}</p>}
      </section>
      <section className="entity-section" aria-labelledby="entity-facts-heading">
        <div className="section-title"><span>02</span><div><h2 id="entity-facts-heading">{text.facts}</h2><p>{text.conflicts}</p></div></div>
        {groups.size ? <div className="entity-fact-groups">{[...groups.entries()].map(([attribute,facts])=><section className="entity-fact-group" key={attribute}>
          <h3>{attribute.replaceAll("_"," ")}{facts.length>1&&<small>{ar?`${facts.length} ادعاءات`: `${facts.length} claims`}</small>}</h3>
          <div className={`entity-claim-grid ${facts.length>1?"has-conflicts":""}`}>{facts.map((fact)=><article key={fact.code} className={`entity-claim ${fact.verification_state==="superseded"||fact.verification_state==="rejected"?"is-deemphasized":""}`}>
            <div className="claim-value"><strong>{fact.value}</strong>{fact.unit&&<span>{fact.unit}</span>}<span className={`verification-badge verification-${fact.verification_state}`}>{verificationLabels[fact.verification_state]?.[language]??fact.verification_state}</span></div>
            {fact.valid_as_of&&<p className="claim-asof">{ar?"صالح بتاريخ":"Valid as of"} <time dateTime={fact.valid_as_of}>{fact.valid_as_of.slice(0,fact.valid_as_of_precision==="day"?10:fact.valid_as_of_precision==="month"?7:4)}</time>{fact.valid_as_of_precision!=="day"&&<small> · {fact.valid_as_of_precision}</small>}</p>}
            {fact.notes&&<p className="claim-notes">{fact.notes}</p>}
            <div className="claim-sources">{fact.evidence.length?fact.evidence.map((source)=><a href={`#source-${source.code}`} key={source.code}>{source.code}</a>):<span>—</span>}</div>
          </article>)}</div>
        </section>)}</div>:<p className="quiet-note">{text.noFacts}</p>}
      </section>
      <section className="entity-section" aria-labelledby="entity-sources-heading">
        <div className="section-title"><span>03</span><div><h2 id="entity-sources-heading">{text.sources}</h2><p>{ar?"بيانات الناشر والنوع والتواريخ والرابط كما وردت في سجل المصدر.":"Publisher, source type, dates, and link as recorded."}</p></div></div>
        {sources.size?<ul className="entity-source-list">{[...sources.values()].sort((a,b)=>a.code.localeCompare(b.code)).map((source)=><li id={`source-${source.code}`} key={source.code}>
          <span className={`source-type-pill source-${source.source_type}`}>{sourceTypeLabels[source.source_type]?.[language]??source.source_type}</span>
          <div className="source-detail"><strong>{source.title??source.code}</strong><span>{source.publisher}{source.source_type==="secondary"?` · ${text.secondary}`:""}</span>
            <small>{source.published_date?`${text.published}: ${source.published_date}`:(ar?"لا يوجد تاريخ نشر مسجل":"Publication date not recorded")} · {text.accessed}: {source.accessed_date}</small>
            {source.url?<a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>:<span className="source-no-link">{ar?"لا يوجد رابط محفوظ":"No URL recorded"}</span>}
          </div>
        </li>)}</ul>:<p className="quiet-note">{text.noSources}</p>}
      </section>
      <p className="page-generated-note">{text.generated} <time dateTime={now}>{now}</time></p>
      {(entity.mapGeometry || entity.facts.length > 0) && <script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd}}/>}
    </main>
    <SiteFooter language={language}/>
  </div>;
}
