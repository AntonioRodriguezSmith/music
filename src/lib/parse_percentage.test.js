import { describe, expect, it } from "vitest";
import { parsePercentage } from "./parse_percentage";

describe("parsePercentage", () => {
  it("parses percent strings and clamps", () => {
    expect(parsePercentage("51%")).toBe(51);
    expect(parsePercentage("100%")).toBe(100);
    expect(parsePercentage("150%")).toBe(100);
    expect(parsePercentage("-5%")).toBe(0);
  });

  it("handles numbers and junk", () => {
    expect(parsePercentage(70)).toBe(70);
    expect(parsePercentage(null)).toBe(0);
    expect(parsePercentage("")).toBe(0);
    expect(parsePercentage("abc")).toBe(0);
  });
});
