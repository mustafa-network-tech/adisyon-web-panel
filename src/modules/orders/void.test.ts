import { describe, expect, it } from "vitest";
import { describeVoid, voidErrorMessage, voidItemInputSchema } from "./void";

const id = "10000000-0000-4000-8000-000000000001";
const base = { tenant: "t", branch: "b", orderId: id, orderItemId: id, expectedVersion: 2, quantity: 1, mode: "void", reason: "müşteri vazgeçti" };

describe("void input", () => {
  it("needs a reason, a quantity and a known mode", () => {
    expect(voidItemInputSchema.safeParse(base).success).toBe(true);
    expect(voidItemInputSchema.safeParse({ ...base, mode: "comp" }).success).toBe(true);
    expect(voidItemInputSchema.safeParse({ ...base, reason: "x" }).success).toBe(false);
    expect(voidItemInputSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(voidItemInputSchema.safeParse({ ...base, mode: "delete" }).success).toBe(false);
  });

  it("explains database errors", () => {
    expect(voidErrorMessage("void_item_paid")).toMatch(/iade/);
    expect(voidErrorMessage("boom")).toBe("İşlem tamamlanamadı.");
  });

  it("words the alert for managers and the kitchen", () => {
    expect(describeVoid({ mode: "void", quantity: 2, productName: "Kebap", reason: "geç kaldı", actorName: "Ece" })).toBe("Ece 2× Kebap iptal etti (geç kaldı)");
    expect(describeVoid({ mode: "comp", quantity: 1, productName: "Kola", reason: "şikayet", actorName: null })).toBe("Bir çalışan 1× Kola ikram etti (şikayet)");
  });
});
