import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/components/site/SiteChrome";

export default function robots(): MetadataRoute.Robots {
  return { rules:{userAgent:"*",allow:"/",disallow:"/api/"},sitemap:`${getSiteUrl()}/sitemap.xml` };
}
