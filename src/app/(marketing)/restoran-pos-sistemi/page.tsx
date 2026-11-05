import { SolutionPageView } from "@/components/marketing/solution-page-view";
import { pageMetadata } from "@/lib/seo";
import { getSolution } from "@/lib/solution-pages";

const page = getSolution("restoran-pos-sistemi");

export const metadata = pageMetadata({ title: page.metaTitle, description: page.metaDescription, path: `/${page.slug}` });

export default function Page() {
  return <SolutionPageView page={page} />;
}
