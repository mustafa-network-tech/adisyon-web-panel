import type { JsonLdObject } from "@/lib/seo";

/** Renders structured data as an inline JSON-LD script (server component). */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  // "<" is escaped so content can never close the script tag.
  const json = JSON.stringify(data).replace(/</g, "\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
