import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadAppMode,
  saveAppMode,
  modeFromPath,
  pathForMode,
  APP_MODES,
} from "./app_mode";

const store = new Map();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  });
});

describe("app_mode", () => {
  it("defaults to download", () => {
    expect(loadAppMode()).toBe(APP_MODES.DOWNLOAD);
  });

  it("persists player mode", () => {
    saveAppMode(APP_MODES.PLAYER);
    expect(loadAppMode()).toBe(APP_MODES.PLAYER);
  });

  it("maps path and mode", () => {
    expect(modeFromPath("/player")).toBe(APP_MODES.PLAYER);
    expect(modeFromPath("/")).toBe(APP_MODES.DOWNLOAD);
    expect(pathForMode(APP_MODES.PLAYER)).toBe("/player");
  });
});
