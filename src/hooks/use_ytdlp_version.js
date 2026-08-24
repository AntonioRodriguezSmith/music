import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri_env";

/**
 * Fetch the installed yt-dlp version once, when `enabled` flips to true
 * (e.g. the cookies panel opens). Returns "" until a version is known.
 *
 * Single responsibility: the version fetch effect + its state.
 */
export function useYtdlpVersion(enabled) {
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (!enabled || !isTauri() || version) return undefined;
    let cancelled = false;
    invoke("get_ytdlp_version")
      .then((v) => {
        if (!cancelled) setVersion(String(v));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, version]);

  return version;
}
