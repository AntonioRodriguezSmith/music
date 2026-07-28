const SNAPSHOT_KEY = "clip_harbour_queue_snapshot";

const RESUMABLE = new Set([
  "queued",
  "starting",
  "downloading",
  "downloaded",
  "converting",
  "retrying",
  "interrupted",
]);

/**
 * @typedef {{
 *   id: string,
 *   config: Record<string, unknown>,
 *   status?: string,
 *   title?: string,
 *   filename?: string,
 *   url?: string,
 * }} SnapshotItem
 */

/** @returns {SnapshotItem[]} */
export function loadQueueSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && item.config && typeof item.config === "object");
  } catch {
    return [];
  }
}

/** @param {SnapshotItem[]} items */
export function saveQueueSnapshot(items) {
  try {
    if (!items?.length) {
      localStorage.removeItem(SNAPSHOT_KEY);
      return;
    }
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function clearQueueSnapshot() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

/** Mark in-flight statuses as interrupted for resume UI after restart. */
export function normalizeSnapshotForResume(items = loadQueueSnapshot()) {
  return items
    .filter((item) => item?.config?.url)
    .map((item) => {
      const status = String(item.status || "interrupted");
      const nextStatus =
        status === "queued" || status === "interrupted" ? status : "interrupted";
      return {
        ...item,
        id: String(item.id ?? ""),
        status: RESUMABLE.has(status) ? nextStatus : status,
        url: item.url || item.config.url,
        title: item.title || item.config.title || "",
      };
    })
    .filter((item) => item.status === "queued" || item.status === "interrupted");
}

/**
 * Build snapshot rows from live config map + status registry.
 * @param {Map<string, Record<string, unknown>>|Record<string, Record<string, unknown>>} configs
 * @param {Record<string, { status?: string, title?: string, filename?: string }>} downloads
 */
export function buildQueueSnapshot(configs, downloads = {}) {
  const entries =
    configs instanceof Map ? [...configs.entries()] : Object.entries(configs || {});
  const items = [];
  for (const [id, config] of entries) {
    if (!config?.url) continue;
    if (config.purpose === "cache") continue;
    const d = downloads[id] || downloads[String(id)];
    const status = d?.status || "queued";
    if (status === "finished" || status === "cancelled" || String(status).startsWith("error")) {
      continue;
    }
    if (!RESUMABLE.has(status) && status !== "queued") continue;
    items.push({
      id: String(id),
      config,
      status,
      title: d?.title || config.title || "",
      filename: d?.filename || "",
      url: config.url,
    });
  }
  return items;
}
