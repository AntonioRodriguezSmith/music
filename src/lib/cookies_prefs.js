const BROWSER_KEY = "clip_harbour_cookies_browser";
const FILE_KEY = "clip_harbour_cookies_file";

export function loadCookiePrefs() {
  try {
    return {
      cookiesFromBrowser: localStorage.getItem(BROWSER_KEY) || "",
      cookiesFile: localStorage.getItem(FILE_KEY) || "",
    };
  } catch {
    return { cookiesFromBrowser: "", cookiesFile: "" };
  }
}

/**
 * Persist cookie prefs. File-only UI: when a file is set, browser pref is cleared.
 * @param {{ cookiesFromBrowser?: string, cookiesFile?: string }} prefs
 */
export function saveCookiePrefs({ cookiesFromBrowser = "", cookiesFile = "" }) {
  try {
    const file = cookiesFile || "";
    // File wins: never keep browser selection alongside a cookies.txt path.
    const browser = file ? "" : cookiesFromBrowser || "";
    if (browser) localStorage.setItem(BROWSER_KEY, browser);
    else localStorage.removeItem(BROWSER_KEY);
    if (file) localStorage.setItem(FILE_KEY, file);
    else localStorage.removeItem(FILE_KEY);
  } catch {
    /* ignore */
  }
}

/** Clear legacy browser selection (e.g. after UI removed the selector). */
export function clearBrowserCookiePref() {
  try {
    localStorage.removeItem(BROWSER_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Args to pass into Tauri invoke / download config (snake_case).
 * If a cookies file is set, never send cookies_from_browser.
 */
export function cookieInvokeArgs(prefs = loadCookiePrefs()) {
  const file = prefs.cookiesFile || null;
  return {
    cookies_file: file,
    cookies_from_browser: file ? null : prefs.cookiesFromBrowser || null,
  };
}
