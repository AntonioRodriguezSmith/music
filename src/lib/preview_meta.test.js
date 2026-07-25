import { describe, expect, it } from "vitest";
import { formatCount, formatUploadDate, truncateDescription } from "./preview_meta";

describe("preview_meta", () => {
  it("formats upload dates", () => {
    expect(formatUploadDate("20240315", "en")).toMatch(/2024/);
    expect(formatUploadDate(null)).toBeNull();
  });

  it("formats counts", () => {
    expect(formatCount(1500, "en")).toBeTruthy();
    expect(formatCount(null)).toBeNull();
  });

  it("truncates descriptions", () => {
    expect(truncateDescription("short")).toBe("short");
    expect(truncateDescription("x".repeat(200), 20).endsWith("…")).toBe(true);
  });
});
