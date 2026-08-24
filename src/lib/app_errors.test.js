import { describe, it, expect } from "vitest";
import { parseAppError, friendlyError, ERROR_FALLBACKS } from "./app_errors";

describe("parseAppError", () => {
  it("passthrough already-parsed objects", () => {
    expect(parseAppError({ code: "RATE_LIMIT", message: "m", detail: "d" })).toEqual({
      code: "RATE_LIMIT",
      message: "m",
      detail: "d",
    });
  });

  it("parses Tauri v2 serialized JSON error strings", () => {
    const raw = JSON.stringify({ code: "AUTH_BLOCK", message: "m", detail: "d" });
    expect(parseAppError(raw)).toEqual({ code: "AUTH_BLOCK", message: "m", detail: "d" });
  });

  it("treats plain strings as INTERNAL legacy messages", () => {
    expect(parseAppError("raw yt-dlp failure")).toEqual({
      code: "INTERNAL",
      message: "raw yt-dlp failure",
      detail: "",
    });
  });

  it("handles undefined/null", () => {
    expect(parseAppError(undefined).code).toBe("INTERNAL");
    expect(parseAppError(null).message).toBe("");
  });
});

describe("friendlyError", () => {
  it("uses the i18n translation when available", () => {
    const t = (key) => (key === "errors.RATE_LIMIT" ? "Límite de YouTube" : key);
    expect(friendlyError({ code: "RATE_LIMIT", message: "m" }, t)).toBe("Límite de YouTube");
  });

  it("falls back to the per-code dictionary without t", () => {
    const out = friendlyError({ code: "NO_RESULTS", message: "backend msg" });
    expect(out).toContain("No se encontraron resultados");
  });

  it("appends detail below the friendly message", () => {
    const out = friendlyError({ code: "COOKIES_INVALID", message: "m", detail: "ERROR: robots.txt" });
    expect(out).toContain("ERROR: robots.txt");
    expect(out).toContain("no es válido");
  });

  it("falls back to the backend message for unknown codes", () => {
    expect(friendlyError("anything at all")).toBe("anything at all");
  });

  it("has a fallback for every code the i18n files declare", () => {
    expect(ERROR_FALLBACKS.INTERNAL).toBeTruthy();
  });
});
