import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri_env";
import { singleFlight } from "./auto_cookies_flight";

/**
 * On startup, extract fresh YouTube cookies from the browser (Firefox →
 * Chrome → Edge) and report the resulting cookies_merged.txt path.
 *
 * Single responsibility: the "auto-refresh from browser" effect. The callbacks
 * live in refs so the effect keeps running exactly once even if the parent
 * re-renders with new inline handlers.
 */
export function useAutoRefreshCookies(onSuccess, onError) {
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!isTauri()) return undefined;
    let cancelled = false;

    singleFlight(() => invoke("refresh_cookies_all"))
      .then((path) => {
        if (cancelled || !path) return;
        onSuccessRef.current?.(path);
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current?.();
      });

    return () => {
      cancelled = true;
    };
  }, []);
}
