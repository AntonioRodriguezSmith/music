// Single-flight guard: React StrictMode (dev) mounts effects twice, so startup
// effects that hit Tauri (refresh_cookies_all, list_cookie_candidates) would
// otherwise fire two concurrent calls (duplicate yt-dlp reads + concurrent
// writes). The first caller starts the promise; any duplicate caller within the
// same tick awaits the same promise instead. Extracted here so it is unit
// testable without mounting React.
let inflight = null;

/** @param {() => Promise<T>} fn @returns {Promise<T>} */
export function singleFlight(fn) {
  if (!inflight) {
    inflight = fn().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
