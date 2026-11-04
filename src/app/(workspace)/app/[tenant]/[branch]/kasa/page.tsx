import type { Metadata } from "next";
import { CheckoutPanel } from "@/modules/checkout/components/checkout-panel";

export const metadata: Metadata = { title: "Kasa" };

export default function CashRegisterPage() {
  return <CheckoutPanel />;
}
