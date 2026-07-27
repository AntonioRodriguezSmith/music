import { describe, expect, it } from "vitest";
import { formatCount, formatUploadDate } from "./preview_meta";

describe("preview_meta", () => {
  it("formats upload dates", () => {
    expect(formatUploadDate("20240115")).toMatch(/2024/);
    expect(formatUploadDate(null)).toBeNull();
  });

  it("formats counts", () => {
    expect(formatCount(1500)).toBeTruthy();
    expect(formatCount(null)).toBeNull();
  });
});
