import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBrowserCookiePref,
  cookieInvokeArgs,
  loadCookiePrefs,
  saveCookiePrefs,
} from "./cookies_prefs";

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
    expect(loadCookiePrefs()).toEqual({ cookiesFromBrowser: "", cookiesFile: "" });
    expect(cookieInvokeArgs()).toEqual({
      cookies_file: null,
      cookies_from_browser: null,
    });
  });

  it("file wins: clears browser on save and in invoke args", () => {
    saveCookiePrefs({ cookiesFromBrowser: "firefox", cookiesFile: "C:\\c.txt" });
    expect(loadCookiePrefs()).toEqual({
      cookiesFromBrowser: "",
      cookiesFile: "C:\\c.txt",
    });
    expect(cookieInvokeArgs()).toEqual({
      cookies_file: "C:\\c.txt",
      cookies_from_browser: null,
    });
  });

  it("browser-only still works when no file", () => {
    saveCookiePrefs({ cookiesFromBrowser: "firefox", cookiesFile: "" });
    expect(loadCookiePrefs()).toEqual({
      cookiesFromBrowser: "firefox",
      cookiesFile: "",
    });
    expect(cookieInvokeArgs()).toEqual({
      cookies_file: null,
      cookies_from_browser: "firefox",
    });
  });

  it("clearBrowserCookiePref removes legacy key", () => {
    store.set("clip_harbour_cookies_browser", "chrome");
    clearBrowserCookiePref();
    expect(loadCookiePrefs().cookiesFromBrowser).toBe("");
  });

  it("removes keys when cleared", () => {
    saveCookiePrefs({ cookiesFromBrowser: "chrome", cookiesFile: "x.txt" });
    saveCookiePrefs({ cookiesFromBrowser: "", cookiesFile: "" });
    expect(loadCookiePrefs()).toEqual({ cookiesFromBrowser: "", cookiesFile: "" });
  });
});
