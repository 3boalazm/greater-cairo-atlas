import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/components/site/SiteChrome";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // BATCH 13: the review workspace is a working tool, not a published page. Its API is also
      // token-gated, but keeping it out of the index avoids both stale snippets and needless crawling.
      disallow: ["/api/", "/admin", "/admin/"],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
