import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { termsOfUse } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: termsOfUse.title,
  description: termsOfUse.description,
  alternates: { canonical: `/${termsOfUse.slug}` },
};

export default function TermsOfUsePage() {
  return <LegalDocumentView doc={termsOfUse} />;
}
