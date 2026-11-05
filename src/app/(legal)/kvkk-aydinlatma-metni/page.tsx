import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { kvkkNotice } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: kvkkNotice.title,
  description: kvkkNotice.description,
  alternates: { canonical: `/${kvkkNotice.slug}` },
};

export default function KvkkNoticePage() {
  return <LegalDocumentView doc={kvkkNotice} />;
}
