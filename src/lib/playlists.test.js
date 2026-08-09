import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadPlaylists,
  savePlaylists,
  addToPlaylist,
  removeFromPlaylist,
  neighborIndex,
  activeList,
  createPlaylist,
  setActivePlaylist,
  renamePlaylist,
  renamePlaylistWithSlug,
  deletePlaylist,
  listMeta,
  markOffline,
  reconcileOffline,
  clearPlaylistItems,
  slugifyPlaylistName,
  emptyPlaylistsState,
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

  it("migrates missing names on load", () => {
    store.set(
      "clip_harbour_playlists",
      JSON.stringify({ activeId: "default", lists: { default: [{ id: "x", title: "X", url: "x" }] } }),
    );
    const state = loadPlaylists();
    expect(state.names.default).toBe("Lista");
    expect(state.lists.default).toHaveLength(1);
  });

  it("slugify and create with collision suffix", () => {
    expect(slugifyPlaylistName("Rock Hits!")).toBe("Rock_Hits");
    let state = emptyPlaylistsState();
    state = createPlaylist(state, "Rock");
    expect(state.activeId).toBe("Rock");
    expect(state.names.Rock).toBe("Rock");
    state = createPlaylist(state, "Rock");
    expect(state.activeId).toBe("Rock-2");
    expect(listMeta(state).map((m) => m.id)).toEqual(["default", "Rock", "Rock-2"]);
  });

  it("select rename delete and markOffline", () => {
    let state = emptyPlaylistsState();
    state = createPlaylist(state, "Jazz");
    state = addToPlaylist(state, { id: "v1", title: "T", url: "https://y.be/v1", duration: "3:00" });
    expect(activeList(state)[0].duration).toBe("3:00");
    state = markOffline(state, "Jazz", "v1", true);
    expect(activeList(state)[0].offline).toBe(true);
    state = setActivePlaylist(state, "default");
    expect(state.activeId).toBe("default");
    state = renamePlaylist(state, "Jazz", "Jazz Club");
    expect(state.names.Jazz).toBe("Jazz Club");
    const renamed = renamePlaylistWithSlug(state, "Jazz", "Blues");
    expect(renamed.oldSlug).toBe("Jazz");
    expect(renamed.newSlug).toBe("Blues");
    state = renamed.state;
    expect(state.lists.Blues).toHaveLength(1);
    expect(state.lists.Jazz).toBeUndefined();
    state = deletePlaylist(state, "Blues");
    expect(state.lists.Blues).toBeUndefined();
    expect(state.activeId).toBe("default");
    state = deletePlaylist(state, "default");
    expect(state.lists.default).toEqual([]);
  });

  it("clears items and reconciles offline flags", () => {
    let state = emptyPlaylistsState();
    state = createPlaylist(state, "Rock");
    state = addToPlaylist(state, { id: "v1", title: "T", url: "u" });
    state = markOffline(state, "Rock", "v1", true);
    expect(activeList(state)[0].offline).toBe(true);
    state = reconcileOffline(state, "Rock", []);
    expect(activeList(state)[0].offline).toBe(false);
    state = reconcileOffline(state, "Rock", ["v1"]);
    expect(activeList(state)[0].offline).toBe(true);
    state = clearPlaylistItems(state, "Rock");
    expect(activeList(state)).toHaveLength(0);
  });
});
