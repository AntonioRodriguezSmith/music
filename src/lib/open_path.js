import { invoke } from "@tauri-apps/api/core";

/**
 * Open a file/folder with the OS via the backend (desktop only). On mobile the
 * backend returns a clear error — callers hide the affordance with `isMobile()`.
 * @param {string} path
 */
export async function openExternalPath(path) {
  const p = String(path || "").trim();
  if (!p) return;
  await invoke("open_path", { path: p });
}
