const PLAYLISTS_KEY = "clip_harbour_playlists";
const DEFAULT_ID = "default";
const DEFAULT_NAME = "Lista";

/**
 * @typedef {{ id: string, title: string, url: string, thumbnail?: string, uploader?: string, duration?: string, offline?: boolean }} PlaylistItem
 * @typedef {{ activeId: string, names: Record<string, string>, lists: Record<string, PlaylistItem[]> }} PlaylistState
 */

export function emptyPlaylistsState() {
  return {
    activeId: DEFAULT_ID,
    names: { [DEFAULT_ID]: DEFAULT_NAME },
    lists: { [DEFAULT_ID]: [] },
  };
}

/** Sanitize for Windows folder names / playlist ids. */
export function slugifyPlaylistName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const slug = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 80);
  return slug || "playlist";
}

function uniqueSlug(desired, existingIds) {
  let base = slugifyPlaylistName(desired) || "playlist";
  if (base === DEFAULT_ID && existingIds.has(DEFAULT_ID) && desired !== DEFAULT_ID) {
    base = "playlist";
  }
  if (!existingIds.has(base)) return base;
  let n = 2;
  while (existingIds.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function migrateNames(lists, names) {
  const next = { ...(names && typeof names === "object" ? names : {}) };
  for (const id of Object.keys(lists || {})) {
    if (!next[id]) {
      next[id] = id === DEFAULT_ID ? DEFAULT_NAME : id;
    }
  }
  if (!next[DEFAULT_ID]) next[DEFAULT_ID] = DEFAULT_NAME;
  return next;
}

export function loadPlaylists() {
  try {
    const raw = localStorage.getItem(PLAYLISTS_KEY);
    if (!raw) return emptyPlaylistsState();
    const parsed = JSON.parse(raw);
    if (!parsed?.lists || typeof parsed.lists !== "object") {
      return emptyPlaylistsState();
    }
    if (!Array.isArray(parsed.lists[DEFAULT_ID])) {
      parsed.lists[DEFAULT_ID] = [];
    }
    const names = migrateNames(parsed.lists, parsed.names);
    const activeId =
      parsed.activeId && parsed.lists[parsed.activeId]
        ? parsed.activeId
        : DEFAULT_ID;
    return {
      activeId,
      names,
      lists: parsed.lists,
    };
  } catch {
    return emptyPlaylistsState();
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

export function listMeta(state) {
  const lists = state?.lists || {};
  const names = state?.names || {};
  return Object.keys(lists).map((id) => ({
    id,
    name: names[id] || (id === DEFAULT_ID ? DEFAULT_NAME : id),
    count: Array.isArray(lists[id]) ? lists[id].length : 0,
  }));
}

export function createPlaylist(state, name) {
  const display = String(name || "").trim();
  if (!display) return state;
  const existing = new Set(Object.keys(state.lists || {}));
  const id = uniqueSlug(display, existing);
  return {
    ...state,
    activeId: id,
    names: { ...state.names, [id]: display },
    lists: { ...state.lists, [id]: [] },
  };
}

export function setActivePlaylist(state, id) {
  const key = String(id || "");
  if (!key || !state.lists?.[key]) return state;
  if (state.activeId === key) return state;
  return { ...state, activeId: key };
}

export function renamePlaylist(state, id, name) {
  const key = String(id || "");
  const display = String(name || "").trim();
  if (!key || !display || !state.lists?.[key]) return state;
  // Keep folder slug (id) stable; only change display name.
  return {
    ...state,
    names: { ...state.names, [key]: display },
  };
}

/**
 * Rename display + optionally remapping folder slug.
 * Returns { state, oldSlug, newSlug } when folder should be renamed.
 */
export function renamePlaylistWithSlug(state, id, name) {
  const key = String(id || "");
  const display = String(name || "").trim();
  if (!key || !display || !state.lists?.[key] || key === DEFAULT_ID) {
    return { state: renamePlaylist(state, id, name), oldSlug: null, newSlug: null };
  }
  const existing = new Set(Object.keys(state.lists || {}).filter((x) => x !== key));
  const newSlug = uniqueSlug(display, existing);
  if (newSlug === key) {
    return {
      state: renamePlaylist(state, id, name),
      oldSlug: null,
      newSlug: null,
    };
  }
  const lists = { ...state.lists };
  lists[newSlug] = lists[key];
  delete lists[key];
  const names = { ...state.names };
  names[newSlug] = display;
  delete names[key];
  return {
    state: {
      ...state,
      activeId: state.activeId === key ? newSlug : state.activeId,
      lists,
      names,
    },
    oldSlug: key,
    newSlug,
  };
}

export function deletePlaylist(state, id) {
  const key = String(id || "");
  if (!key || key === DEFAULT_ID || !state.lists?.[key]) return state;
  const lists = { ...state.lists };
  delete lists[key];
  const names = { ...state.names };
  delete names[key];
  const activeId = state.activeId === key ? DEFAULT_ID : state.activeId;
  return { ...state, activeId, lists, names };
}

/** Remove all items from a list (keeps the list id). */
export function clearPlaylistItems(state, id) {
  const key = String(id || state.activeId || DEFAULT_ID);
  if (!state.lists?.[key]) return state;
  return {
    ...state,
    lists: { ...state.lists, [key]: [] },
  };
}

/**
 * Sync offline flags from a set of video ids present on disk.
 * @param {PlaylistState} state
 * @param {string} listId
 * @param {string[]} diskIds
 */
export function reconcileOffline(state, listId, diskIds) {
  const lid = String(listId || state.activeId || DEFAULT_ID);
  if (!state.lists?.[lid]) return state;
  const onDisk = new Set((diskIds || []).map(String));
  let changed = false;
  const list = (state.lists[lid] || []).map((item) => {
    const key = itemKey(item);
    const nextOffline = onDisk.has(key);
    if (Boolean(item.offline) !== nextOffline) {
      changed = true;
      return { ...item, offline: nextOffline };
    }
    return item;
  });
  if (!changed) return state;
  return {
    ...state,
    lists: { ...state.lists, [lid]: list },
  };
}

export function addToPlaylist(state, item) {
  const key = itemKey(item);
  if (!key) return state;
  const listId = state.activeId || DEFAULT_ID;
  const list = [...(state.lists[listId] || [])];
  if (list.some((x) => itemKey(x) === key)) return state;
  list.push({
    id: key,
    title: item.title || key,
    url: item.url || key,
    thumbnail: item.thumbnail || "",
    uploader: item.uploader || item.channel || "",
    duration: item.duration || "",
    offline: Boolean(item.offline),
  });
  return {
    ...state,
    lists: { ...state.lists, [listId]: list },
  };
}

export function removeFromPlaylist(state, id) {
  const listId = state.activeId || DEFAULT_ID;
  const list = (state.lists[listId] || []).filter((x) => itemKey(x) !== String(id));
  return {
    ...state,
    lists: { ...state.lists, [listId]: list },
  };
}

export function markOffline(state, listId, videoId, offline) {
  const lid = String(listId || state.activeId || DEFAULT_ID);
  const vid = String(videoId || "");
  if (!vid || !state.lists?.[lid]) return state;
  const list = (state.lists[lid] || []).map((item) =>
    itemKey(item) === vid ? { ...item, offline: Boolean(offline) } : item,
  );
  return {
    ...state,
    lists: { ...state.lists, [lid]: list },
  };
}

export function reorderPlaylist(state, fromIndex, toIndex) {
  const listId = state.activeId || DEFAULT_ID;
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
  return state.lists[state.activeId || DEFAULT_ID] || [];
}

export function neighborIndex(list, currentId, delta) {
  if (!list.length) return -1;
  const idx = list.findIndex((x) => itemKey(x) === String(currentId));
  if (idx < 0) return delta > 0 ? 0 : list.length - 1;
  const next = idx + delta;
  if (next < 0 || next >= list.length) return -1;
  return next;
}
