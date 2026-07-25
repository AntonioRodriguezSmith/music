const HISTORY_KEY = "clip_harbour_search_history";
export const SEARCH_HISTORY_MAX = 15;

function readRaw() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === "string" && item.trim());
  } catch {
    return [];
  }
}

function writeRaw(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function loadSearchHistory() {
  return readRaw().slice(0, SEARCH_HISTORY_MAX);
}

export function pushSearchHistory(query) {
  const value = String(query ?? "").trim();
  if (!value) return loadSearchHistory();

  const lower = value.toLowerCase();
  const next = [
    value,
    ...loadSearchHistory().filter((item) => item.toLowerCase() !== lower),
  ].slice(0, SEARCH_HISTORY_MAX);

  writeRaw(next);
  return next;
}

export function removeSearchHistoryItem(query) {
  const lower = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!lower) return loadSearchHistory();

  const next = loadSearchHistory().filter((item) => item.toLowerCase() !== lower);
  writeRaw(next);
  return next;
}

export function clearSearchHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
  return [];
}
