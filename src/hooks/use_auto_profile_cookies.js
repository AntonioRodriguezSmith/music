import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri_env";
import { loadCookiePrefs } from "../lib/cookies_prefs";
import { singleFlight } from "./auto_cookies_flight";

/**
 * On startup, if no cookies file is configured yet, scan the app-managed
 * cookies folder (falling back to the legacy `cookies_youtube` folder) and
 * pick the most likely candidate.
 *
 * Single responsibility: the "auto-profile" effect. Only fires when nothing is
 * configured, so a manual choice from a previous session is never overridden.
 */
export function useAutoProfileCookies(onPicked) {
  const onPickedRef = useRef(onPicked);
  onPickedRef.current = onPicked;

  useEffect(() => {
    if (!isTauri() || loadCookiePrefs().cookiesFile) return undefined;
    let cancelled = false;

    singleFlight(() => invoke("list_cookie_candidates"))
      .then((files) => {
        if (cancelled || !Array.isArray(files) || files.length === 0) return;
        // Never pick a temp jar (`cookies_raw_<browser>.txt`): it is deleted
        // after refresh and would leave a stale path.
        const stable = files.filter((f) => !/cookies_raw_/i.test(f));
        const pool = stable.length > 0 ? stable : files;
        const preferred = pool.find(
          (f) =>
            /cookies\.txt$/i.test(f) ||
            /cookies_(merged|chrome|edge|firefox)\.txt$/i.test(f),
        );
        onPickedRef.current?.(preferred || pool[0]);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);
}
