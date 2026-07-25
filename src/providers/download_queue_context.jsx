import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { isActive, isFinished } from "../lib/download_status";
import { loadDownloadHistory, pushDownloadHistory } from "../lib/download_history";
import {
  buildQueueSnapshot,
  clearQueueSnapshot,
  normalizeSnapshotForResume,
  saveQueueSnapshot,
} from "../lib/queue_snapshot";
import { isTauri } from "../lib/tauri_env";

const DownloadQueueContext = createContext({
  downloads: {},
  setDownloads: () => {},
  history: [],
  setHistory: () => {},
  toast: null,
  clearToast: () => {},
  resumeItems: [],
  registerDownloadConfig: () => {},
  resumePending: async () => {},
  dismissResume: () => {},
});

export function DownloadQueueProvider({ children }) {
  const [downloads, setDownloads] = useState({});
  const [history, setHistory] = useState(() => loadDownloadHistory());
  const [toast, setToast] = useState(null);
  const [resumeItems, setResumeItems] = useState(() => normalizeSnapshotForResume());
  const prevRef = useRef({});
  const configsRef = useRef(new Map());

  const registerDownloadConfig = useCallback((id, config) => {
    if (id == null || !config) return;
    configsRef.current.set(String(id), config);
  }, []);

  const dismissResume = useCallback(() => {
    clearQueueSnapshot();
    setResumeItems([]);
  }, []);

  const resumePending = useCallback(async () => {
    if (!isTauri() || resumeItems.length === 0) {
      dismissResume();
      return;
    }
    const failures = [];
    for (const item of resumeItems) {
      try {
        const processId = await invoke("start_download", { config: item.config });
        registerDownloadConfig(processId, item.config);
      } catch (err) {
        failures.push(
          `${item.title || item.url}: ${
            typeof err === "string" ? err : err?.message || "failed"
          }`,
        );
      }
    }
    clearQueueSnapshot();
    setResumeItems([]);
    if (failures.length) {
      console.error(failures.join("\n"));
    }
  }, [dismissResume, registerDownloadConfig, resumeItems]);

  useEffect(() => {
    let cancelled = false;
    let unlisten;

    listen("status", (event) => {
      if (cancelled) return;
      const next = event.payload ?? {};
      const prev = prevRef.current;

      for (const [id, download] of Object.entries(next)) {
        const was = prev[id];
        if (isFinished(download.status) && was && !isFinished(was.status)) {
          const cfg = configsRef.current.get(String(id));
          setHistory(
            pushDownloadHistory({
              id: String(id),
              title: download.title || cfg?.title || "",
              filename: download.filename || "",
              url: cfg?.url || "",
              status: download.status,
            }),
          );
          configsRef.current.delete(String(id));
        }
        if (
          (download.status === "cancelled" || String(download.status).startsWith("error")) &&
          was &&
          was.status !== download.status
        ) {
          configsRef.current.delete(String(id));
        }
      }

      const hadActive = Object.values(prev).some((d) => isActive(d.status));
      const hasActive = Object.values(next).some((d) => isActive(d.status));
      const finishedNow = Object.entries(next).some(
        ([id, d]) => isFinished(d.status) && prev[id] && !isFinished(prev[id].status),
      );
      if (hadActive && !hasActive && finishedNow) {
        setToast("batchDone");
      }

      prevRef.current = next;
      setDownloads(next);
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const items = buildQueueSnapshot(configsRef.current, downloads);
      saveQueueSnapshot(items);
    }, 300);
    return () => clearTimeout(timer);
  }, [downloads]);

  return (
    <DownloadQueueContext.Provider
      value={{
        downloads,
        setDownloads,
        history,
        setHistory,
        toast,
        clearToast: () => setToast(null),
        resumeItems,
        registerDownloadConfig,
        resumePending,
        dismissResume,
      }}
    >
      {children}
    </DownloadQueueContext.Provider>
  );
}

export function useDownloadQueue() {
  return useContext(DownloadQueueContext);
}
