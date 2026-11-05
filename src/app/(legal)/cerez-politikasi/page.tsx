import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { cookiePolicy } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: cookiePolicy.title,
  description: cookiePolicy.description,
  alternates: { canonical: `/${cookiePolicy.slug}` },
};

export default function CookiePolicyPage() {
  return <LegalDocumentView doc={cookiePolicy} />;
}
