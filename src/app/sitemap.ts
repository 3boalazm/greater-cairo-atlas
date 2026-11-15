import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/components/site/SiteChrome";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const dataset = await getStaticAtlasDataset();
  const localized = (path: string): MetadataRoute.Sitemap => {
    const ar = `${base}/ar${path}`;
    const en = `${base}/en${path}`;
    const languages = { ar, en };
    return [
      { url: ar, lastModified: new Date(), alternates: { languages } },
      { url: en, lastModified: new Date(), alternates: { languages } },
    ];
  };
  const paths = ["", "/directory", "/data", "/methodology", "/sources", "/api-docs"];
  return [
    ...paths.flatMap((path) => localized(path)),
    ...dataset.evidence.flatMap((source) => localized(`/sources/${encodeURIComponent(source.code)}`)),
    ...dataset.entities.flatMap((entity) => localized(`/entity/${encodeURIComponent(entity.code)}`)),
  ];
}
