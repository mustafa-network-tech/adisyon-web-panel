import type { Metadata } from "next";
import { contactEmail, shareImage, siteDescription, siteName, siteUrl } from "./site";
import { company } from "./legal";

/** Page types that are public and indexable. Everything else is noindex. */
export type PageMetaInput = {
  /** Page title without the brand; the root template appends "| Adisyon Web". */
  title: string;
  /** Use the title exactly as given (the home page, which already names the brand). */
  absoluteTitle?: boolean;
  description: string;
  /** Path starting with "/", e.g. "/qr-menu". Becomes the canonical URL. */
  path: string;
};

/** Absolute canonical URL for a path (always the www host). */
export function absoluteUrl(path: string) {
  return `${siteUrl}${path === "/" ? "" : path}`;
}

/**
 * Full metadata for a public marketing page. Open Graph and Twitter objects
 * replace (not merge with) the root ones, so they are repeated here.
 */
export function pageMetadata({ title, absoluteTitle = false, description, path }: PageMetaInput): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} | ${siteName}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "tr_TR",
      siteName,
      url: path,
      title: fullTitle,
      description,
      images: [shareImage],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [shareImage] },
  };
}

/** Metadata for private screens: panel, auth, callbacks, QR sessions. */
export const noIndexMetadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export type JsonLdObject = { "@context": "https://schema.org" } & Record<string, unknown>;

const organizationId = `${siteUrl}/#organization`;
const websiteId = `${siteUrl}/#website`;

export function organizationSchema(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId,
    name: company.name,
    url: siteUrl,
    logo: `${siteUrl}/icons/app-icon-512.png`,
    email: contactEmail,
  };
}

export function websiteSchema(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": websiteId,
    name: siteName,
    url: siteUrl,
    inLanguage: "tr-TR",
    publisher: { "@id": organizationId },
  };
}

/**
 * No `offers`: the visible price list has a time-limited launch price followed
 * by a regular price, which a single schema.org Offer cannot state faithfully.
 */
export function softwareApplicationSchema(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${siteUrl}/#software`,
    name: siteName,
    url: siteUrl,
    description: siteDescription,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web tarayıcısı (telefon, tablet ve masaüstü)",
    inLanguage: "tr-TR",
    publisher: { "@id": organizationId },
  };
}

export type Crumb = { name: string; path: string };

export function breadcrumbSchema(crumbs: Crumb[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}
