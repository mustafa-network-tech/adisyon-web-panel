import type { MetadataRoute } from "next";
import { legalLinks, legalUpdatedAt } from "@/lib/legal";
import { absoluteUrl } from "@/lib/seo";
import { solutionPages } from "@/lib/solution-pages";

/** Last meaningful change of the home page content (not the build time). */
const HOME_UPDATED_AT = "2026-11-05";
const SUPPORT_UPDATED_AT = "2026-11-05";

/**
 * Only public, indexable, canonical URLs. Login, signup, workspace, admin,
 * callback and QR-session routes are intentionally absent.
 * lastModified values are fixed dates that change only when content changes.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), lastModified: HOME_UPDATED_AT, changeFrequency: "weekly", priority: 1 },
    ...solutionPages.map((page) => ({
      url: absoluteUrl(`/${page.slug}`),
      lastModified: page.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: absoluteUrl("/destek"), lastModified: SUPPORT_UPDATED_AT, changeFrequency: "yearly", priority: 0.4 },
    ...legalLinks.map((link) => ({
      url: absoluteUrl(link.href),
      lastModified: legalUpdatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
