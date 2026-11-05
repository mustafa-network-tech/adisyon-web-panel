import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { privacyPolicy } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: privacyPolicy.title,
  description: privacyPolicy.description,
  alternates: { canonical: `/${privacyPolicy.slug}` },
};

export default function PrivacyPolicyPage() {
  return <LegalDocumentView doc={privacyPolicy} />;
}
