export const DOWNLOAD_PATH_STORAGE_KEY = "clip_harbour_download_path";

/**
 * Resolve download path: localStorage wins, then env default, else null.
 * @param {string | null | undefined} stored
 * @param {string | null | undefined} envDefault
 */
export function resolveDownloadPath(stored, envDefault) {
  if (stored && String(stored).trim()) return String(stored).trim();
  if (envDefault && String(envDefault).trim()) return String(envDefault).trim();
  return null;
}
