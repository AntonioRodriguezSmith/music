import { invoke } from "@tauri-apps/api/core";
import { loadCookiePrefs, saveCookiePrefs } from "../../lib/cookies_prefs";
import { useAutoProfileCookies } from "../../hooks/use_auto_profile_cookies";
import { useAutoRefreshCookies } from "../../hooks/use_auto_refresh_cookies";

function applyFile(nextFile) {
  saveCookiePrefs({ cookiesFile: nextFile });
}

async function maybeApplyAutoRefresh(path) {
  const configured = loadCookiePrefs().cookiesFile;
  if (configured) {
    try {
      const valid = await invoke("cookies_file_valid", { path: configured });
      if (valid) return;
      console.warn(`replacing stale cookies path: ${configured}`);
    } catch {
      return;
    }
  }
  applyFile(path);
}

/**
 * Mounted once at the app root (desktop only): keeps the cookies auto-refresh
 * and auto-profile effects running on startup even though `CookiesSettings` now
 * only renders on demand at `/settings`. Renders nothing.
 */
export default function CookieStartup() {
  useAutoRefreshCookies(
    (path) => maybeApplyAutoRefresh(path),
    () => {},
  );
  useAutoProfileCookies(applyFile);
  return null;
}
