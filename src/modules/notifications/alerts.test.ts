import { describe, expect, it } from "vitest";
import { addAlert, callAlert, readyAlert, shouldNotifyReady, shouldNotifyVoid, voidAlert } from "./alerts";

describe("service alerts", () => {
  it("notifies the order taker, everyone for QR orders, and floor managers", () => {
    expect(shouldNotifyReady({ orderCreatedBy: "me", userId: "me", overseesFloor: false })).toBe(true);
    expect(shouldNotifyReady({ orderCreatedBy: null, userId: "me", overseesFloor: false })).toBe(true);
    expect(shouldNotifyReady({ orderCreatedBy: "other", userId: "me", overseesFloor: false })).toBe(false);
    expect(shouldNotifyReady({ orderCreatedBy: "other", userId: "me", overseesFloor: true })).toBe(true);
  });

  it("words ready orders and customer calls", () => {
    expect(readyAlert("t1", "Masa 4", 12, "Mutfak").title).toBe("Masa 4 · sipariş hazır");
    expect(callAlert("c1", "waiter", "Masa 4").title).toContain("garson çağırıyor");
    expect(callAlert("c1", "bill", "Masa 4").title).toContain("hesap istiyor");
    expect(callAlert("c1", "bill", "Masa 4").callId).toBe("c1");
  });

  it("does not show the same alert twice and keeps the newest first within a limit", () => {
    const first = readyAlert("t1", "Masa 1", 1);
    const second = readyAlert("t2", "Masa 2", 2);
    expect(addAlert(addAlert([], first), first)).toHaveLength(1);
    expect(addAlert([first], second)[0].id).toBe("ready:t2");
    const many = Array.from({ length: 10 }, (_, index) => readyAlert(`t${index}`, "M", index)).reduce<ReturnType<typeof addAlert>>((list, alert) => addAlert(list, alert, 3), []);
    expect(many).toHaveLength(3);
  });
});

describe("void alerts", () => {
  const base = { actorUserId: "waiter", userId: "me", overseesFloor: false, watchesKitchen: false };

  it("tells managers, but not the person who did it", () => {
    expect(shouldNotifyVoid({ ...base, mode: "void", overseesFloor: true })).toBe(true);
    expect(shouldNotifyVoid({ ...base, mode: "comp", overseesFloor: true })).toBe(true);
    expect(shouldNotifyVoid({ ...base, mode: "void", overseesFloor: true, actorUserId: "me" })).toBe(false);
  });

  it("tells the kitchen about cancellations only", () => {
    expect(shouldNotifyVoid({ ...base, mode: "void", watchesKitchen: true })).toBe(true);
    expect(shouldNotifyVoid({ ...base, mode: "comp", watchesKitchen: true })).toBe(false);
    expect(shouldNotifyVoid({ ...base, mode: "void" })).toBe(false);
  });

  it("builds the alert", () => {
    const alert = voidAlert({ id: "1", tableLabel: "Masa 4", text: "Ece 1× Kebap iptal etti (x)", mode: "void" });
    expect(alert.title).toBe("Masa 4 · ürün iptali");
    expect(alert.kind).toBe("void");
  });
});
