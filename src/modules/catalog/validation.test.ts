import { describe, expect, it } from "vitest";
import { parseCategoryInput, parseProductInput } from "./validation";

describe("catalog validation", () => {
  it("accepts a valid product and converts TRY to minor units", () => {
    const result = parseProductInput({
      id: "",
      categoryId: "10000000-0000-4000-8000-000000000001",
      kitchenStationId: "",
      name: "Izgara Tavuk",
      description: "",
      price: "365,50",
      taxRate: "10",
      isActive: true,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priceMinor).toBe(36550);
  });

  it("defaults categories to kitchen and accepts direct service", () => {
    const base = { id: "", name: "Soğuk İçecekler", isActive: true };
    const fallback = parseCategoryInput(base);
    expect(fallback.success && fallback.data.fulfillment).toBe("kitchen");
    const direct = parseCategoryInput({ ...base, fulfillment: "direct" });
    expect(direct.success && direct.data.fulfillment).toBe("direct");
    expect(parseCategoryInput({ ...base, fulfillment: "bar" }).success).toBe(false);
  });

  it("lets a product inherit or override its category's preparation place", () => {
    const product = {
      id: "",
      categoryId: "10000000-0000-4000-8000-000000000001",
      kitchenStationId: "",
      name: "Kola",
      description: "",
      price: "40",
      taxRate: "10",
      isActive: true,
    };
    const inherit = parseProductInput(product);
    expect(inherit.success && inherit.data.fulfillment).toBe("");
    const direct = parseProductInput({ ...product, fulfillment: "direct" });
    expect(direct.success && direct.data.fulfillment).toBe("direct");
    expect(parseProductInput({ ...product, fulfillment: "x" }).success).toBe(false);
  });

  it("rejects invalid names and prices", () => {
    expect(parseCategoryInput({ id: "", name: "A", isActive: true }).success).toBe(false);
    expect(parseProductInput({
      id: "",
      categoryId: "not-a-uuid",
      kitchenStationId: "",
      name: "X",
      description: "",
      price: "12,345",
      taxRate: "200",
      isActive: true,
    }).success).toBe(false);
  });
});
