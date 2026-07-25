const HISTORY_KEY = "clip_harbour_download_history";
const MAX_ITEMS = 200;

/**
 * @typedef {{ id: string, title: string, url?: string, filename?: string, finishedAt: number, status?: string }} HistoryItem
 */

/** @returns {HistoryItem[]} */
export function loadDownloadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** @param {HistoryItem[]} items */
function saveDownloadHistory(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* ignore */
  }
}

/**
 * @param {Omit<HistoryItem, "finishedAt"> & { finishedAt?: number }} item
 * @returns {HistoryItem[]}
 */
export function pushDownloadHistory(item) {
  const nextItem = {
    ...item,
    id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    finishedAt: item.finishedAt || Date.now(),
  };
  const prev = loadDownloadHistory().filter(
    (h) => !(h.title === nextItem.title && h.filename && h.filename === nextItem.filename),
  );
  const next = [nextItem, ...prev].slice(0, MAX_ITEMS);
  saveDownloadHistory(next);
  return next;
}

export function clearDownloadHistory() {
  saveDownloadHistory([]);
  return [];
}

/** @param {HistoryItem[]} items */
export function exportDownloadHistoryText(items = loadDownloadHistory()) {
  return items
    .map((item) => {
      const when = new Date(item.finishedAt).toISOString();
      return [when, item.title || "", item.filename || "", item.url || ""]
        .join("\t")
        .trimEnd();
    })
    .join("\n");
}
