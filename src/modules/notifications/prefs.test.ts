import { describe, expect, it } from "vitest";
import { allows, defaultPrefs, groupOf, loadPrefs, parsePrefs, PREFS_KEY, savePrefs } from "./prefs";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    data,
  };
}

describe("notification preferences", () => {
  it("starts with everything on except system notifications", () => {
    expect(loadPrefs(memoryStorage())).toEqual(defaultPrefs);
    expect(loadPrefs(null)).toEqual(defaultPrefs);
  });

  it("keeps the old sound switch working", () => {
    expect(loadPrefs(memoryStorage({ "mk-alert-sound": "off" })).sound).toBe(false);
    expect(loadPrefs(memoryStorage({ "mk-alert-sound": "on" })).sound).toBe(true);
  });

  it("saves and reads back, ignoring broken data", () => {
    const storage = memoryStorage();
    savePrefs(storage, { sound: false, system: true, groups: { ready: true, calls: false, voids: true } });
    expect(loadPrefs(storage)).toEqual({ sound: false, system: true, groups: { ready: true, calls: false, voids: true } });
    expect(parsePrefs("{not json")).toEqual(defaultPrefs);
    expect(parsePrefs(JSON.stringify({ sound: "yes", groups: { ready: 1 } }))).toEqual(defaultPrefs);
    expect(Object.keys(storage.data)).toEqual([PREFS_KEY]);
  });

  it("maps alert kinds to the groups people switch on and off", () => {
    expect(groupOf("ready")).toBe("ready");
    expect(groupOf("waiter")).toBe("calls");
    expect(groupOf("bill")).toBe("calls");
    expect(groupOf("void")).toBe("voids");
    const quietCalls = { ...defaultPrefs, groups: { ...defaultPrefs.groups, calls: false } };
    expect(allows(quietCalls, "waiter")).toBe(false);
    expect(allows(quietCalls, "ready")).toBe(true);
  });
});
