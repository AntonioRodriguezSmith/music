const PLAYLISTS_KEY = "clip_harbour_playlists";

/** @typedef {{ id: string, title: string, url: string, thumbnail?: string, uploader?: string }} PlaylistItem */

export function loadPlaylists() {
  try {
    const raw = localStorage.getItem(PLAYLISTS_KEY);
    if (!raw) return { activeId: "default", lists: { default: [] } };
    const parsed = JSON.parse(raw);
    if (!parsed?.lists || typeof parsed.lists !== "object") {
      return { activeId: "default", lists: { default: [] } };
    }
    if (!Array.isArray(parsed.lists.default)) {
      parsed.lists.default = [];
    }
    return {
      activeId: parsed.activeId || "default",
      lists: parsed.lists,
    };
  } catch {
    return { activeId: "default", lists: { default: [] } };
  }
}

export function savePlaylists(state) {
  try {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function itemKey(item) {
  return String(item?.id || item?.url || "");
}

export function addToPlaylist(state, item) {
  const key = itemKey(item);
  if (!key) return state;
  const listId = state.activeId || "default";
  const list = [...(state.lists[listId] || [])];
  if (list.some((x) => itemKey(x) === key)) return state;
  list.push({
    id: key,
    title: item.title || key,
    url: item.url || key,
    thumbnail: item.thumbnail || "",
    uploader: item.uploader || item.channel || "",
  });
  return {
    ...state,
    lists: { ...state.lists, [listId]: list },
  };
}

export function removeFromPlaylist(state, id) {
  const listId = state.activeId || "default";
  const list = (state.lists[listId] || []).filter((x) => itemKey(x) !== String(id));
  return {
    ...state,
    lists: { ...state.lists, [listId]: list },
  };
}

export function reorderPlaylist(state, fromIndex, toIndex) {
  const listId = state.activeId || "default";
  const list = [...(state.lists[listId] || [])];
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length
  ) {
    return state;
  }
  const [moved] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, moved);
  return {
    ...state,
    lists: { ...state.lists, [listId]: list },
  };
}

export function activeList(state) {
  return state.lists[state.activeId || "default"] || [];
}

export function neighborIndex(list, currentId, delta) {
  if (!list.length) return -1;
  const idx = list.findIndex((x) => itemKey(x) === String(currentId));
  if (idx < 0) return delta > 0 ? 0 : list.length - 1;
  const next = idx + delta;
  if (next < 0 || next >= list.length) return -1;
  return next;
}
