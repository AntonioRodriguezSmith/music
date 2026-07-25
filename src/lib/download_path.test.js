import { describe, expect, it } from "vitest";
import { resolveDownloadPath } from "../lib/download_path.js";
import { isActive, isFinished } from "../lib/download_status.js";

describe("resolveDownloadPath", () => {
  it("prefers stored path over env", () => {
    expect(resolveDownloadPath("C:\\Music", "D:\\Other")).toBe("C:\\Music");
  });

  it("falls back to env then null", () => {
    expect(resolveDownloadPath(null, "D:\\Other")).toBe("D:\\Other");
    expect(resolveDownloadPath("  ", "")).toBeNull();
    expect(resolveDownloadPath(null, null)).toBeNull();
  });
});

describe("download status helpers", () => {
  it("detects finished and active states", () => {
    expect(isFinished("finished")).toBe(true);
    expect(isFinished("downloading")).toBe(false);
    expect(isActive("downloading")).toBe(true);
    expect(isActive("starting")).toBe(true);
    expect(isActive("downloaded")).toBe(true);
    expect(isActive("converting")).toBe(true);
    expect(isActive("paused")).toBe(false);
  });
});
