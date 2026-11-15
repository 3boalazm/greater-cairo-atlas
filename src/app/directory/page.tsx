import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader, getSiteUrl, localizedPath, resolveLanguage } from "@/components/site/SiteChrome";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";
import { SECTOR_LABELS, STATUS_LABELS, translateLabel } from "@/lib/atlas/labels";
import { aliasList, disambiguationNote, duplicateVisibleLabels, entityListLabel, entityTypeLabel, groupByRegionalScope, regionalLinkLabel, regionalLinkNote } from "@/lib/atlas/entity-presentation";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }): Promise<Metadata> {
  const language = resolveLanguage((await searchParams).lang);
  const canonical = `${getSiteUrl()}${localizedPath(language, "/directory")}`;
  return {
    title: language === "ar" ? "دليل كيانات الأطلس" : "Atlas entity directory",
    description: language === "ar" ? "دليل قابل للفهرسة لكيانات أطلس القاهرة الكبرى." : "A crawlable directory of Greater Cairo Atlas entities.",
    alternates: { canonical, languages: { ar: `${getSiteUrl()}/ar/directory`, en: `${getSiteUrl()}/en/directory` } },
  };
}

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const language = resolveLanguage((await searchParams).lang);
  const ar = language === "ar";
  const dataset = await getStaticAtlasDataset();
  const allEntities = [...dataset.entities].sort((a, b) => a.sector.localeCompare(b.sector) || a.name_ar.localeCompare(b.name_ar, "ar"));
  // BATCH 12.2 — REGIONAL entities stay in the directory (relations and facts point at them) but are
  // presented in their own group and never counted as Greater Cairo entities.
  const { local, regional } = groupByRegionalScope(allEntities);
  const toRow = (entity: (typeof allEntities)[number]) => ({
    entity,
    label: entityListLabel(entity, language),
    names: [entity.name_ar, entity.name_en, ...aliasList(entity.aliases)],
  });
  const allRows = allEntities.map(toRow);
  // BATCH 12.3 — a row whose name another entity also uses gets one short disambiguation line.
  const rowsFor = (entities: typeof allEntities) => entities.map((entity) => {
    const row = toRow(entity);
    return { ...row, note: disambiguationNote({ code: entity.code, displayLabel: row.label, names: row.names }, allRows.map((item) => ({ code: item.entity.code, displayLabel: item.label, names: item.names })), language) };
  });
  const localRows = rowsFor(local);
  const regionalRows = rowsFor(regional);
  // Fails loudly in development if a label rule regresses; the test suite asserts the same thing.
  if (process.env.NODE_ENV !== "production") {
    const collisions = duplicateVisibleLabels([...localRows, ...regionalRows].map((row) => ({ code: row.entity.code, label: row.label })));
    if (collisions.length) throw new Error(`Directory labels collide: ${JSON.stringify(collisions)}`);
  }
  const renderRows = (rows: ReturnType<typeof rowsFor>) => rows.map(({ entity, label, note }) => <article className="directory-item" key={entity.code}>
    <div><h2><Link href={`/${language}/entity/${encodeURIComponent(entity.code)}`}>{label}</Link></h2>
      <p>{ar ? entity.name_en : entity.name_ar} · <code>{entity.code}</code></p>
      {note && <p className="directory-disambiguation">{note}</p>}</div>
    <div className="directory-meta"><span>{entityTypeLabel(entity, language)}</span>
      <span>{translateLabel(SECTOR_LABELS, entity.sector, language)} <small title={entity.sector}>({entity.sector})</small></span>
      <span className={`status-pill status-${entity.status}`}>{translateLabel(STATUS_LABELS, entity.status, language)} <small title={entity.status}>({entity.status})</small></span></div>
  </article>);
  return <div className="site-layout" lang={language} dir={ar ? "rtl" : "ltr"}>
    <SiteHeader language={language} />
    <main className="site-content document-page directory-page" id="main-content">
      <p className="site-eyebrow">{ar ? "دليل الأطلس" : "ATLAS DIRECTORY"}</p>
      <h1>{ar ? "كيانات القاهرة الكبرى" : "Greater Cairo entities"}</h1>
      <p className="site-lede">{ar ? "قائمة كاملة قابلة للفهرسة. أسماء الكيانات كما في السجل؛ لا تُخمن الترجمات أو الحالة أو الهندسة." : "A crawlable index of every atlas entity. Names follow the register; translations, status, and geometry are not guessed."}</p>
      <p>{local.length.toLocaleString(ar ? "ar-EG" : "en-US")} {ar ? "كيانًا داخل نطاق القاهرة الكبرى" : "entities in Greater Cairo"}</p>
      <div className="directory-list">{renderRows(localRows)}</div>
      {regional.length > 0 && <section className="directory-regional" aria-labelledby="regional-heading">
        <h2 id="regional-heading">{regionalLinkLabel(language)}</h2>
        <p className="quiet-note">{regionalLinkNote(language)} ({regional.length.toLocaleString(ar ? "ar-EG" : "en-US")})</p>
        <div className="directory-list">{renderRows(regionalRows)}</div>
      </section>}
    </main>
    <SiteFooter language={language} />
  </div>;
}
