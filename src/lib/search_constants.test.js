import { describe, expect, it } from "vitest";
import {
  pageSizeForListHeight,
  shouldRecalcPageSize,
  SEARCH_PAGE_SIZE,
  SEARCH_PAGE_SIZE_MAX,
  SEARCH_PAGE_SIZE_MIN,
  SEARCH_ROW_HEIGHT_PX,
} from "./search_constants";

describe("pageSizeForListHeight", () => {
  it("packs whole rows into the list viewport", () => {
    expect(pageSizeForListHeight(18 * SEARCH_ROW_HEIGHT_PX)).toBe(18);
    expect(pageSizeForListHeight(18 * SEARCH_ROW_HEIGHT_PX + 20)).toBe(18);
  });

  it("clamps to min/max", () => {
    expect(pageSizeForListHeight(1)).toBe(SEARCH_PAGE_SIZE_MIN);
    expect(pageSizeForListHeight(100 * SEARCH_ROW_HEIGHT_PX)).toBe(SEARCH_PAGE_SIZE_MAX);
  });

  it("falls back when height is empty", () => {
    expect(pageSizeForListHeight(0)).toBe(SEARCH_PAGE_SIZE);
  });

  it("is stable for the same height (freeze contract)", () => {
    const h = 15 * SEARCH_ROW_HEIGHT_PX + 10;
    expect(pageSizeForListHeight(h)).toBe(pageSizeForListHeight(h));
  });
});

describe("shouldRecalcPageSize", () => {
  it("allows measure only when unlocked and not mid-search", () => {
    expect(shouldRecalcPageSize({ locked: false })).toBe(true);
    expect(shouldRecalcPageSize({ locked: true })).toBe(false);
    expect(shouldRecalcPageSize({ locked: false, isNewSearch: true })).toBe(false);
    expect(shouldRecalcPageSize({ locked: true, isNewSearch: true })).toBe(false);
  });
});
