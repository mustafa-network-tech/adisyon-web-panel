import { describe, expect, it } from "vitest";
import { parseDiningAreaInput, parseRestaurantTableInput } from "./validation";

describe("dining validation", () => {
  it("accepts valid area and table inputs", () => {
    expect(parseDiningAreaInput({ id: "", name: "Bahçe", isActive: true }).success).toBe(true);
    expect(parseRestaurantTableInput({
      id: "",
      areaId: "10000000-0000-4000-8000-000000000001",
      label: "B01",
      capacity: "4",
      status: "available",
    }).success).toBe(true);
  });

  it("rejects invalid capacity and status", () => {
    expect(parseRestaurantTableInput({
      id: "",
      areaId: "10000000-0000-4000-8000-000000000001",
      label: "B01",
      capacity: "0",
      status: "occupied",
    }).success).toBe(false);
  });
});
