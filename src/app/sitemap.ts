import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/components/site/SiteChrome";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base=getSiteUrl();
  const dataset=await getStaticAtlasDataset();
  const pages:MetadataRoute.Sitemap=[
    {url:base,lastModified:new Date(),changeFrequency:"weekly",priority:1},
    {url:`${base}/data`,lastModified:new Date(),changeFrequency:"monthly",priority:0.7},
    {url:`${base}/methodology`,lastModified:new Date(),changeFrequency:"monthly",priority:0.6},
    {url:`${base}/sources`,lastModified:new Date(),changeFrequency:"monthly",priority:0.6},
  ];
  return [...pages,...dataset.entities.map((entity)=>({url:`${base}/entity/${encodeURIComponent(entity.code)}`,lastModified:new Date(),changeFrequency:"monthly" as const,priority:0.7}))];
}
