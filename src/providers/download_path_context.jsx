import { useEffect, useState, createContext } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  DOWNLOAD_PATH_STORAGE_KEY,
  resolveDownloadPath,
} from "../lib/download_path";
import { isTauri } from "../lib/tauri_env";

export const DownloadPathContext = createContext();

function initialPath() {
  let stored = null;
  try {
    stored = localStorage.getItem(DOWNLOAD_PATH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return resolveDownloadPath(stored, import.meta.env.VITE_DEFAULT_DOWNLOAD_PATH);
}

export const DownloadPathProvider = ({ children }) => {
  const [downloadPath, setDownloadPathState] = useState(initialPath);

  // On startup, make sure the persisted path is usable: a stale path from
  // another user (e.g. `C:\Users\rodri\…`) is replaced by a writable default
  // so downloads never fail with an opaque access-denied error.
  useEffect(() => {
    if (!isTauri()) return undefined;
    let cancelled = false;
    invoke("resolve_download_dir", { dir: downloadPath })
      .then((real) => {
        if (cancelled || !real || real === downloadPath) return;
        setDownloadPathState(real);
        try {
          localStorage.setItem(DOWNLOAD_PATH_STORAGE_KEY, real);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setDownloadPath = (path) => {
    setDownloadPathState(path);
    try {
      if (path) localStorage.setItem(DOWNLOAD_PATH_STORAGE_KEY, path);
      else localStorage.removeItem(DOWNLOAD_PATH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <DownloadPathContext.Provider value={{ downloadPath, setDownloadPath }}>
      {children}
    </DownloadPathContext.Provider>
  );
};
