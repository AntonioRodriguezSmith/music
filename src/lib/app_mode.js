const MODE_KEY = "clip_harbour_app_mode";

export const APP_MODES = {
  DOWNLOAD: "download",
  PLAYER: "player",
};

const VALID = new Set([APP_MODES.DOWNLOAD, APP_MODES.PLAYER]);

export function loadAppMode() {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (VALID.has(stored)) return stored;
  } catch {
    /* ignore */
  }
  return APP_MODES.DOWNLOAD;
}

export function saveAppMode(mode) {
  try {
    if (VALID.has(mode)) {
      localStorage.setItem(MODE_KEY, mode);
    }
  } catch {
    /* ignore */
  }
}

export function modeFromPath(pathname) {
  return pathname?.startsWith("/player") ? APP_MODES.PLAYER : APP_MODES.DOWNLOAD;
}

export function pathForMode(mode) {
  return mode === APP_MODES.PLAYER ? "/player" : "/";
}
