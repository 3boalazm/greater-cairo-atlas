import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityMap } from "@/components/atlas/EntityMap";
import { AreaBoundaryToggle } from "@/components/atlas/AreaBoundaryToggle";
import { SiteFooter, SiteHeader, getSiteUrl, localizedPath, resolveLanguage } from "@/components/site/SiteChrome";
import { ResearcherOnly } from "@/components/site/ResearchMode";
import { getStaticEntityPageData } from "@/lib/atlas/static-dataset";
import type { AtlasFeatureCollection } from "@/components/atlas/atlas-client";
import { transitModeLabel, transitModesForEntityCode } from "@/lib/atlas/transit-modes";
import { SuggestionForm } from "@/components/atlas/SuggestionForm";
import { EntityTimeline } from "@/components/atlas/EntityTimeline";
import { ENTITY_TYPE_LABELS, FACT_ATTRIBUTE_LABELS, SECTOR_LABELS, SIMPLE_STATUS_LABELS, SOURCE_TYPE_LABELS, VERIFICATION_LABELS, stationDisplayName, translateLabel } from "@/lib/atlas/labels";

interface EntityPageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}
const simpleFactLabels: Record<string, { ar: string; en: string }> = {
  length: { ar: "الطول", en: "Length" }, length_approx: { ar: "الطول التقريبي", en: "Approximate length" },
  total_length: { ar: "الطول الإجمالي", en: "Total length" }, stations_count: { ar: "عدد المحطات", en: "Stations" }, total_stations: { ar: "عدد المحطات", en: "Stations" },
  stations: { ar: "المحطات", en: "Stations" }, capacity_per_day: { ar: "السعة اليومية", en: "Daily capacity" }, population: { ar: "عدد السكان", en: "Population" }, opening_date: { ar: "موعد الافتتاح", en: "Opening date" },
};

const labels = {
  ar: {
    entity: "صفحة الكيان", aliases: "أسماء بديلة", type: "النوع", sector: "النطاق الجغرافي", status: "الحالة المسجلة",
    asOf: "أحدث تاريخ مرجعي للحالة", statusDateMissing: "لا يوجد تاريخ مرجعي صريح للحالة في الحقائق المتاحة.",
    map: "الخريطة", notMapped: "لا توجد خريطة متاحة لهذا الكيان", facts: "الحقائق", conflicts: "القيم المتعددة أو المتعارضة معروضة جنبًا إلى جنب.",
    noFacts: "لا توجد حقائق مسجلة لهذا الكيان.", sources: "المصادر المرتبطة", noSources: "لا توجد مصادر مرتبطة.",
    published: "تاريخ النشر", accessed: "تاريخ الاطلاع", secondary: "مصدر ثانوي", back: "العودة إلى الخريطة", code: "الرمز",
    generated: "عُرضت هذه الصفحة بتاريخ", sectorLabels: { NORTH:"الشمال", EAST:"الشرق", SOUTH:"الجنوب", WEST:"الغرب", CENTRAL:"الوسط", REGIONAL:"إقليمي" } as Record<string,string>,
  },
  en: {
    entity: "Entity profile", aliases: "Aliases", type: "Type", sector: "Geographic sector", status: "Recorded status",
    asOf: "Latest status reference date", statusDateMissing: "No explicit status reference date is present in the available facts.",
    map: "Map", notMapped: "No map is available for this entity yet.", facts: "Facts", conflicts: "Multiple or conflicting claims are shown side by side.",
    noFacts: "No facts are recorded for this entity.", sources: "Linked sources", noSources: "No linked sources.",
    published: "Published", accessed: "Accessed", secondary: "Secondary source", back: "Back to map", code: "Code",
    generated: "This page was rendered on", sectorLabels: { NORTH:"North", EAST:"East", SOUTH:"South", WEST:"West", CENTRAL:"Central", REGIONAL:"Regional" } as Record<string,string>,
  },
} as const;

export async function generateMetadata({ params, searchParams }: EntityPageProps): Promise<Metadata> {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const language = resolveLanguage(query.lang);
  const entity = await getStaticEntityPageData(code);
  if (!entity) return { title: language === "ar" ? "الكيان غير موجود" : "Entity not found", robots: { index:false, follow:false } };
  const name = language === "ar" ? entity.name_ar : entity.name_en;
  const canonical = `${getSiteUrl()}${localizedPath(language, `/entity/${encodeURIComponent(entity.code)}`)}`;
  const description = language === "ar"
    ? `${entity.name_ar} (${entity.name_en}): الحالة المسجلة والحقائق ومصادرها والهندسة المتاحة في أطلس القاهرة الكبرى.`
    : `${entity.name_en} (${entity.name_ar}): documented status, facts, sources, and available geometry in the Greater Cairo Atlas.`;
  return {
    title: name,
    description,
    alternates: { canonical, languages: { ar: `${getSiteUrl()}/ar/entity/${encodeURIComponent(entity.code)}`, en: `${getSiteUrl()}/en/entity/${encodeURIComponent(entity.code)}` } },
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
  const entityLineCodes = entity.facts.filter((fact) => fact.attribute === "line_membership").map((fact) => fact.value);
  const entityModes = transitModesForEntityCode(entity.code, entityLineCodes);
  const transitLabel = transitModeLabel(entity.code, language, entityLineCodes);
  const factsSectionIndex = 2 + Number(entity.relations.length > 0) + Number(entity.neighbors.length > 0);
  const simpleKeyFacts = entity.facts.filter((fact) => fact.attribute in simpleFactLabels && !["rejected", "superseded"].includes(fact.verification_state))
    .sort((a, b) => Object.keys(simpleFactLabels).indexOf(a.attribute) - Object.keys(simpleFactLabels).indexOf(b.attribute) || a.code.localeCompare(b.code)).slice(0, 3);

  const groups=new Map<string,typeof entity.facts>();
  for (const fact of entity.facts) groups.set(fact.attribute,[...(groups.get(fact.attribute) ?? []),fact]);
  const sources=new Map(entity.facts.flatMap((fact)=>fact.evidence.map((source)=>[source.code,source] as const)));
  const statusDates=entity.facts.filter((fact)=>/status|lifecycle/i.test(fact.attribute) && fact.valid_as_of).map((fact)=>fact.valid_as_of!).sort();
  const statusAsOf=statusDates.at(-1) ?? null;
  const now=new Date().toISOString().slice(0,10);
  const canonical=`${getSiteUrl()}${localizedPath(language, `/entity/${encodeURIComponent(entity.code)}`)}`;
  const placeJsonLd={
    "@context":"https://schema.org","@type":"Place","@id":`${canonical}#place`,"url":canonical,
    "name":entity.name_en,"alternateName":entity.name_ar,"identifier":entity.code,
    ...(entity.mapGeometry ? { description:entity.description ?? undefined } : {}),
  };
  const safeJsonLd=JSON.stringify(placeJsonLd).replaceAll("<","\\u003c");
  const mapFeatures:AtlasFeatureCollection={type:"FeatureCollection",metadata:{data_license:"© Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0",geometry_license:"© OpenStreetMap contributors, ODbL 1.0",contact:"01092500454 · 3boalazm@gmail.com"},features:entity.mapGeometry?[{
    type:"Feature",id:`ENTITY-MAP-${entity.code}`,geometry:entity.mapGeometry,
    properties:{code:`ENTITY-MAP-${entity.code}`,entity_code:entity.code,name_ar:entity.name_ar,name_en:entity.name_en,type:entity.entity_type,status:entity.status,license:entity.mapLicense,attribution:entity.mapAttribution,source:"Source geometries, merged and simplified for display",retrieval_date:"",source_ids:[],modes:entityModes,interchange:entityModes.length>1},
  }]:[]};

  return <div className="site-layout" lang={language} dir={ar?"rtl":"ltr"}>
    <SiteHeader language={language}/>
    <main className="site-content entity-page" id="main-content">
      <nav className="breadcrumbs" aria-label={ar?"مسار التنقل":"Breadcrumbs"}><Link href={`/${language}`}>{text.back}</Link><span aria-hidden="true">/</span><span>{text.entity}</span></nav>
      <section className="entity-hero">
        <div><p className="site-eyebrow">{text.entity} · {translateLabel(ENTITY_TYPE_LABELS, entity.entity_type, language)}</p>
          <h1>{stationDisplayName(entity.code, entity.name_ar)}<span lang="en" dir="ltr">{entity.name_en}</span></h1>
          <p className="entity-code">{text.code}: <code>{entity.code}</code></p>
        </div>
        <div className="entity-hero-status"><span>{text.status}</span><strong className={`simple-status-word status-${entity.status}`}><span aria-hidden="true">{entity.status === "operational" ? "✓" : entity.status === "partial" ? "◐" : entity.status === "under_construction" ? "⚒" : entity.status === "planned" || entity.status === "approved_planned" ? "◷" : "?"}</span>{translateLabel(SIMPLE_STATUS_LABELS, entity.status, language)}</strong>
          <ResearcherOnly>{statusAsOf ? <small>{text.asOf}: <time dateTime={statusAsOf}>{statusAsOf}</time></small> : <small>{text.statusDateMissing}</small>}</ResearcherOnly>
        </div>
      </section>

      <section className="entity-simple-summary" aria-label={ar ? "ملخص" : "Summary"}>
        <p>{entity.description || (ar ? `${entity.name_ar} ${translateLabel(ENTITY_TYPE_LABELS, entity.entity_type, language)} في نطاق القاهرة الكبرى.` : `${entity.name_en} is a ${translateLabel(ENTITY_TYPE_LABELS, entity.entity_type, language).toLowerCase()} in Greater Cairo.`)}</p>
        <p>{ar ? "الحالة المسجلة" : "Recorded status"}: <strong>{translateLabel(SIMPLE_STATUS_LABELS, entity.status, language)}</strong></p>
      </section>
      <section className="entity-section" aria-labelledby="entity-map-heading">
        <div className="section-title"><span>01</span><div><h2 id="entity-map-heading">{text.map}</h2><ResearcherOnly><p>{ar?"الموقع كما ورد في المصدر؛ لا تُضاف وصلات غير موثقة.":"Recorded source geometry; undocumented connectors are not added."}</p></ResearcherOnly></div></div>
        <ResearcherOnly>{entity.has_boundary && <AreaBoundaryToggle code={entity.code} name={stationDisplayName(entity.code, ar ? entity.name_ar : entity.name_en)} language={language} />}</ResearcherOnly>
        <ResearcherOnly>{!entity.has_boundary && ["city", "district", "neighborhood", "authority"].includes(entity.entity_type) && <p className="boundary-unavailable-note">{ar ? "الحدود غير متاحة في المصدر" : "Boundary unavailable in source"}</p>}</ResearcherOnly>
        {entity.mapGeometry ? <><EntityMap features={mapFeatures} language={language} attribution={entity.mapAttribution}/><ResearcherOnly><p className="map-data-attribution">{entity.mapAttribution} · OpenFreeMap</p></ResearcherOnly></> : <p className="not-mapped-note">{text.notMapped}</p>}
      </section>
      <section className="entity-section simple-key-facts" aria-labelledby="entity-key-facts-heading">
        <div className="section-title"><span>02</span><div><h2 id="entity-key-facts-heading">{ar ? "معلومات سريعة" : "Key facts"}</h2></div></div>
        {simpleKeyFacts.length ? <ul>{simpleKeyFacts.map((fact) => <li key={fact.code}><span>{simpleFactLabels[fact.attribute]![language]}</span><strong>{fact.value}{fact.unit ? ` ${fact.unit}` : ""}</strong>{fact.verification_state === "verified" && <small className="official-verified-badge">{ar ? "موثّق رسميًا ✓" : "Officially verified ✓"}</small>}</li>)}</ul> : <p className="quiet-note">{ar ? "لا توجد معلومات موجزة مسجلة." : "No short facts are recorded."}</p>}
      </section>
      <ResearcherOnly><section className="entity-section" aria-labelledby="entity-sources-heading">
        <div className="section-title"><span>{String(factsSectionIndex + 2).padStart(2,"0")}</span><div><h2 id="entity-sources-heading">{text.sources}</h2><p>{ar?"بيانات الناشر والنوع والتواريخ والرابط كما وردت في سجل المصدر.":"Publisher, source type, dates, and link as recorded."}</p></div></div>
        {sources.size?<ul className="entity-source-list">{[...sources.values()].sort((a,b)=>a.code.localeCompare(b.code)).map((source)=><li id={`source-${source.code}`} key={source.code}>
          <span title={source.source_type} className={`source-type-pill source-${source.source_type}`}>{translateLabel(SOURCE_TYPE_LABELS, source.source_type, language)}</span>
          <div className="source-detail"><strong><Link href={`/${language}/sources/${encodeURIComponent(source.code)}`}>{source.title??source.code}</Link></strong><span>{source.publisher}{source.source_type==="secondary"?` · ${text.secondary}`:""}</span>
            <small>{source.published_date?`${text.published}: ${source.published_date}`:(ar?"لا يوجد تاريخ نشر مسجل":"Publication date not recorded")} · {text.accessed}: {source.accessed_date}</small>
            {source.url?<a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>:<span className="source-no-link">{ar?"لا يوجد رابط محفوظ":"No URL recorded"}</span>}
          </div>
        </li>)}</ul>:<p className="quiet-note">{text.noSources}</p>}
      </section></ResearcherOnly>
      <ResearcherOnly className="entity-researcher-sections">
      <dl className="entity-factsheet">
        <div><dt>{text.type}</dt><dd>{translateLabel(ENTITY_TYPE_LABELS, entity.entity_type, language)}</dd></div>
        <div><dt>{text.sector}</dt><dd>{translateLabel(SECTOR_LABELS, entity.sector, language)}</dd></div>
        <div><dt>{text.aliases}</dt><dd>{entity.aliases.length?entity.aliases.join(" · "):"—"}</dd></div>
        {transitLabel && <div><dt>{ar ? "وسيلة النقل" : "Transit mode"}</dt><dd><span className="transit-mode-pill">{transitLabel}</span></dd></div>}
        <div><dt>{ar?"لقطة السجل":"Record snapshot"}</dt><dd><time dateTime={now}>{now}</time></dd></div>
      </dl>
      {entity.relations.length > 0 && <section className="entity-section entity-relations-section" aria-labelledby="entity-relations-heading">
        <div className="section-title"><span>02</span><div><h2 id="entity-relations-heading">{ar ? "العلاقات" : "Relations"}</h2><p>{ar ? "علاقات صريحة مسندة إلى أدلة؛ لا تُستنتج من القرب الجغرافي." : "Explicit evidence-backed links; none are inferred from proximity."}</p></div></div>
        <ul className="entity-relations-list">{[...entity.relations].sort((a,b) => (a.ordinal ?? Number.MAX_SAFE_INTEGER) - (b.ordinal ?? Number.MAX_SAFE_INTEGER)).map((relation) => {
          const target = relation.subject_code === entity.code ? relation.object : relation.subject;
          const relationLabels: Record<string,{ar:string;en:string}> = {has_station:{ar:"محطة على الخط",en:"Station on line"},interchange_with:{ar:"تبادل مع",en:"Interchanges with"},part_of:{ar:"جزء من",en:"Part of"},crosses:{ar:"يعبر",en:"Crosses"},connects:{ar:"يربط",en:"Connects"},located_in:{ar:"يقع في",en:"Located in"},operated_by:{ar:"تشغّله",en:"Operated by"},developed_by:{ar:"تطوره",en:"Developed by"}};
          return <li key={`${relation.subject_code}:${relation.predicate}:${relation.object_code}`}>
            {relation.ordinal && <span className="relation-ordinal">{relation.ordinal}</span>}<span>{relationLabels[relation.predicate]?.[language] ?? relation.predicate}</span>
            <Link href={`/${language}/entity/${encodeURIComponent(target.code)}#entity-map-heading`} title={ar ? "فتح الكيان على صفحته وخريطته" : "Open entity profile and map"}>{ar ? target.name_ar : target.name_en}</Link>
            {relation.predicate === "interchange_with" && <span className="transit-mode-pill">{ar ? "تبادل" : "Interchange"}</span>}
            {relation.evidence_ref && <Link className="relation-evidence-link" href={`/${language}/sources/${encodeURIComponent(relation.evidence_ref)}`}>{relation.evidence_ref}</Link>}
          </li>;
        })}</ul>
      </section>}
      {entity.neighbors.length > 0 && <section className="entity-section" aria-labelledby="entity-neighbors-heading">
        <div className="section-title"><span>03</span><div><h2 id="entity-neighbors-heading">{ar ? "المحطات المجاورة على الخط" : "Neighboring stations on line"}</h2><p>{ar ? "المجاورة مشتقة فقط من ترتيب المحطات المسند إلى أدلة أو مسار OSM مطابق." : "Adjacency follows only evidence-backed station order or an exactly matched OSM route."}</p></div></div>
        <ul className="entity-relations-list">{entity.neighbors.map((neighbor) => <li key={`${neighbor.subject_code}:${neighbor.object_code}`}>
          <span className="relation-ordinal">{neighbor.ordinal}</span><span>{neighbor.direction === "previous" ? (ar ? "المحطة السابقة" : "Previous station") : (ar ? "المحطة التالية" : "Next station")}</span>
          <Link href={`/${language}/entity/${encodeURIComponent(neighbor.object_code)}#entity-map-heading`}>{ar ? neighbor.object.name_ar : neighbor.object.name_en}</Link>
          {neighbor.evidence_ref && <Link className="relation-evidence-link" href={`/${language}/sources/${encodeURIComponent(neighbor.evidence_ref)}`}>{neighbor.evidence_ref}</Link>}
        </li>)}</ul>
      </section>}
      <section className="entity-section" aria-labelledby="entity-facts-heading">
        <div className="section-title"><span>{String(factsSectionIndex).padStart(2,"0")}</span><div><h2 id="entity-facts-heading">{text.facts}</h2><p>{text.conflicts}</p></div></div>
        {groups.size ? <div className="entity-fact-groups">{[...groups.entries()].map(([attribute,facts])=><section className="entity-fact-group" key={attribute}>
          <h3 title={attribute}>{translateLabel(FACT_ATTRIBUTE_LABELS, attribute, language)}{facts.length>1&&<small>{ar?`${facts.length} ادعاءات`: `${facts.length} claims`}</small>}</h3>
          <div className={`entity-claim-grid ${facts.length>1?"has-conflicts":""}`}>{facts.map((fact)=><article key={fact.code} className={`entity-claim ${fact.verification_state==="superseded"||fact.verification_state==="rejected"?"is-deemphasized":""}`}>
            <div className="claim-value"><strong>{fact.value}</strong>{fact.unit&&<span>{fact.unit}</span>}<span className={`verification-badge verification-${fact.verification_state}`}>{translateLabel(VERIFICATION_LABELS, fact.verification_state, language)}</span></div>
            {fact.valid_as_of&&<p className="claim-asof">{ar?"صالح بتاريخ":"Valid as of"} <time dateTime={fact.valid_as_of}>{fact.valid_as_of.slice(0,fact.valid_as_of_precision==="day"?10:fact.valid_as_of_precision==="month"?7:4)}</time>{fact.valid_as_of_precision!=="day"&&<small> · {fact.valid_as_of_precision}</small>}</p>}
            {fact.notes&&<p className="claim-notes">{fact.notes}</p>}
            <div className="claim-sources">{fact.evidence.length?fact.evidence.map((source)=><Link href={`/${language}/sources/${encodeURIComponent(source.code)}`} key={source.code}>{source.code}</Link>):<span>—</span>}</div>
          </article>)}</div>
        </section>)}</div>:<p className="quiet-note">{text.noFacts}</p>}
      </section>
      <section className="entity-section"><EntityTimeline facts={entity.facts} language={language}/></section>
      <section className="entity-section entity-export-section">
        <a className="entity-export-link" href={`/api/exports/entities/${encodeURIComponent(entity.code)}`}>{ar ? "تنزيل بيانات الكيان وحقائقه وأدلته وهندسته" : "Download entity, facts, evidence & geometry"} · JSON</a>
      </section>
      </ResearcherOnly>
      <ResearcherOnly><details className="entity-section suggestion-disclosure"><summary>{ar ? "اقترح تصحيحًا أو مصدرًا" : "Suggest a correction or source"}</summary><p>{ar ? "يُراجع الاقتراح بشريًا ولا يغيّر الحقائق تلقائيًا." : "Suggestions are reviewed by a person and never update facts automatically."}</p>
        <SuggestionForm entityCode={entity.code} attributes={[...groups.keys()]} language={language}/>
      </details></ResearcherOnly>
      <ResearcherOnly><p className="page-generated-note">{text.generated} <time dateTime={now}>{now}</time></p></ResearcherOnly>
      {(entity.mapGeometry || entity.facts.length > 0) && <script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd}}/>}
    </main>
    <SiteFooter language={language}/>
  </div>;
}
