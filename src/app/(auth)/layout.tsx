import type { Metadata } from "next";
import { noIndexMetadata } from "@/lib/seo";

/** Login, signup, password and invitation screens must never be indexed. */
export const metadata: Metadata = noIndexMetadata;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
