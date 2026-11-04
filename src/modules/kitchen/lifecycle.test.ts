import { describe, expect, it } from "vitest";
import { getKitchenActionLabel, getNextKitchenStatus } from "./lifecycle";

describe("kitchen lifecycle", () => {
  it("advances tickets through the only valid forward path", () => {
    expect(getNextKitchenStatus("new")).toBe("preparing");
    expect(getNextKitchenStatus("preparing")).toBe("ready");
    expect(getNextKitchenStatus("ready")).toBe("served");
  });

  it("provides an action label for every active state", () => {
    expect(getKitchenActionLabel("new")).toBe("Hazırlamaya başla");
    expect(getKitchenActionLabel("preparing")).toBe("Hazır olarak işaretle");
    expect(getKitchenActionLabel("ready")).toBe("Servise teslim et");
  });
});
