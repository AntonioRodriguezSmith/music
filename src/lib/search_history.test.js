import { beforeEach, describe, expect, it } from "vitest";
import {
  SEARCH_HISTORY_MAX,
  clearSearchHistory,
  loadSearchHistory,
  pushSearchHistory,
  removeSearchHistoryItem,
} from "./search_history.js";

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

beforeEach(() => {
  globalThis.localStorage = createMemoryStorage();
});

describe("search_history", () => {
  it("ignores empty pushes", () => {
    expect(pushSearchHistory("")).toEqual([]);
    expect(pushSearchHistory("   ")).toEqual([]);
    expect(loadSearchHistory()).toEqual([]);
  });

  it("pushes newest first and dedupes case-insensitively", () => {
    pushSearchHistory("Bad Bunny");
    pushSearchHistory("arcangel");
    expect(pushSearchHistory("bad bunny")).toEqual(["bad bunny", "arcangel"]);
  });

  it("caps at SEARCH_HISTORY_MAX", () => {
    for (let i = 0; i < SEARCH_HISTORY_MAX + 5; i += 1) {
      pushSearchHistory(`q${i}`);
    }
    const history = loadSearchHistory();
    expect(history).toHaveLength(SEARCH_HISTORY_MAX);
    expect(history[0]).toBe(`q${SEARCH_HISTORY_MAX + 4}`);
    expect(history.at(-1)).toBe("q5");
  });

  it("removes a single item and clears all", () => {
    pushSearchHistory("a");
    pushSearchHistory("b");
    expect(removeSearchHistoryItem("A")).toEqual(["b"]);
    expect(clearSearchHistory()).toEqual([]);
    expect(loadSearchHistory()).toEqual([]);
  });
});
