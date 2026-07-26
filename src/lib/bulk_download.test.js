import { describe, expect, it } from "vitest";
import { shouldTreatAsBulk } from "./bulk_download";

describe("shouldTreatAsBulk", () => {
  it("is false for empty or single selection", () => {
    expect(shouldTreatAsBulk([])).toBe(false);
    expect(shouldTreatAsBulk([{ url: "a" }])).toBe(false);
    expect(shouldTreatAsBulk(null)).toBe(false);
  });

  it("is true when two or more are selected", () => {
    expect(shouldTreatAsBulk([{ url: "a" }, { url: "b" }])).toBe(true);
  });
});
