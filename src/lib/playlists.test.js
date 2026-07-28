import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadPlaylists,
  savePlaylists,
  addToPlaylist,
  removeFromPlaylist,
  neighborIndex,
  activeList,
} from "./playlists";

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

describe("playlists", () => {
  it("adds and skips duplicates", () => {
    let state = loadPlaylists();
    state = addToPlaylist(state, { id: "abc", title: "A", url: "abc" });
    state = addToPlaylist(state, { id: "abc", title: "A", url: "abc" });
    expect(activeList(state)).toHaveLength(1);
    savePlaylists(state);
    expect(loadPlaylists().lists.default).toHaveLength(1);
  });

  it("removes and neighbors", () => {
    let state = loadPlaylists();
    state = addToPlaylist(state, { id: "a", title: "A", url: "a" });
    state = addToPlaylist(state, { id: "b", title: "B", url: "b" });
    expect(neighborIndex(activeList(state), "a", 1)).toBe(1);
    state = removeFromPlaylist(state, "a");
    expect(activeList(state)).toHaveLength(1);
  });
});
