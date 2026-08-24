/** True when running inside the Tauri webview (not a normal browser). */
export function isTauri() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

/**
 * True on touch-first mobile platforms (Android/iOS webview). Switches the UI
 * to the mobile shell (bottom nav, no hover, no desktop-only panels). Detected
 * from the user agent because Tauri's `platform` API is not wired in.
 */
export function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}
