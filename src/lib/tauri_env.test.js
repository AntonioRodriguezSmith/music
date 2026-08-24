import { afterEach, describe, expect, it, vi } from "vitest";
import { isMobile, isTauri } from "./tauri_env";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tauri_env", () => {
  it("isMobile detects Android webview", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36",
    });
    expect(isMobile()).toBe(true);
  });

  it("isMobile detects iPhone/iPad", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile",
    });
    expect(isMobile()).toBe(true);
  });

  it("isMobile is false on desktop browsers", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });
    expect(isMobile()).toBe(false);
  });

  it("isMobile is false without a navigator", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isMobile()).toBe(false);
  });

  it("isTauri requires the Tauri internals global", () => {
    vi.stubGlobal("window", {});
    expect(isTauri()).toBe(false);
    vi.stubGlobal("window", { __TAURI_INTERNALS__: { metadata: {} } });
    expect(isTauri()).toBe(true);
  });
});
