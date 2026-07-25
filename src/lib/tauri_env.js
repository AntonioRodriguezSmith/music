/** True when running inside the Tauri webview (not a normal browser). */
export function isTauri() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}
