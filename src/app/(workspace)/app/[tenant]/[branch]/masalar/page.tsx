import type { Metadata } from "next";
import { TableBoard } from "@/modules/tables/components/table-board";

export const metadata: Metadata = { title: "Masalar" };

export default function TablesPage() {
  return <TableBoard />;
}
