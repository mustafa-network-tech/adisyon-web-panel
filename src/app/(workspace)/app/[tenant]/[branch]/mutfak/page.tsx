import type { Metadata } from "next";
import { KitchenBoard } from "@/modules/kitchen/components/kitchen-board";

export const metadata: Metadata = { title: "Mutfak" };

export default function KitchenPage() {
  return <KitchenBoard />;
}
