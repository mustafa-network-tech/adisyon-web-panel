import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * Crawlers may read the public marketing site. Workspace, admin, API, callback,
 * invitation and QR-session paths are blocked here and also carry noindex.
 * Login/signup pages are NOT blocked on purpose: Google must be able to fetch
 * them to see their noindex tag. /_next/ and static assets stay crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/app/",
        "/mk-admin",
        "/api/",
        "/auth/",
        "/qr/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
