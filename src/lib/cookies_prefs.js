const BROWSER_KEY = "clip_harbour_cookies_browser";
const FILE_KEY = "clip_harbour_cookies_file";

/** @returns {{ cookiesFile: string }} */
export function loadCookiePrefs() {
  try {
    // Drop legacy browser key if still present from older builds.
    localStorage.removeItem(BROWSER_KEY);
    return {
      cookiesFile: localStorage.getItem(FILE_KEY) || "",
    };
  } catch {
    return { cookiesFile: "" };
  }
}

/**
 * Persist cookies.txt path (file-only UI).
 * @param {{ cookiesFile?: string }} prefs
 */
export function saveCookiePrefs({ cookiesFile = "" } = {}) {
  try {
    localStorage.removeItem(BROWSER_KEY);
    const file = cookiesFile || "";
    if (file) localStorage.setItem(FILE_KEY, file);
    else localStorage.removeItem(FILE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Args to pass into Tauri invoke / download config (snake_case).
 * File-only: never send cookies_from_browser.
 */
export function cookieInvokeArgs(prefs = loadCookiePrefs()) {
  return {
    cookies_file: prefs.cookiesFile || null,
    cookies_from_browser: null,
  };
}
