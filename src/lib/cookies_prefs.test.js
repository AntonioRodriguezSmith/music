import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookieInvokeArgs, loadCookiePrefs, saveCookiePrefs } from "./cookies_prefs";

const store = new Map();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  });
});

describe("cookies_prefs", () => {
  it("defaults empty and maps null invoke args", () => {
    expect(loadCookiePrefs()).toEqual({ cookiesFile: "" });
    expect(cookieInvokeArgs()).toEqual({
      cookies_file: null,
      cookies_from_browser: null,
    });
  });

  it("persists file and never sends browser flag", () => {
    saveCookiePrefs({ cookiesFile: "C:\\c.txt" });
    expect(loadCookiePrefs()).toEqual({ cookiesFile: "C:\\c.txt" });
    expect(cookieInvokeArgs()).toEqual({
      cookies_file: "C:\\c.txt",
      cookies_from_browser: null,
    });
  });

  it("clears legacy browser key on load", () => {
    store.set("clip_harbour_cookies_browser", "chrome");
    store.set("clip_harbour_cookies_file", "x.txt");
    expect(loadCookiePrefs()).toEqual({ cookiesFile: "x.txt" });
    expect(store.has("clip_harbour_cookies_browser")).toBe(false);
  });

  it("removes keys when cleared", () => {
    saveCookiePrefs({ cookiesFile: "x.txt" });
    saveCookiePrefs({ cookiesFile: "" });
    expect(loadCookiePrefs()).toEqual({ cookiesFile: "" });
  });
});
