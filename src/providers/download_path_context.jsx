import { useState, createContext } from "react";
import {
  DOWNLOAD_PATH_STORAGE_KEY,
  resolveDownloadPath,
} from "../lib/download_path";

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
