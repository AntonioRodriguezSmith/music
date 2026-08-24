import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { cookieInvokeArgs } from "../lib/cookies_prefs";
import { isMobile, isTauri } from "../lib/tauri_env";
import {
  activeList,
  addToPlaylist as addItem,
  clearPlaylistItems,
  createPlaylist as createList,
  deletePlaylist as deleteList,
  listMeta,
  loadPlaylists,
  neighborIndex,
  reconcileOffline,
  removeFromPlaylist as removeItem,
  renamePlaylistWithSlug,
  savePlaylists,
  setActivePlaylist,
  itemKey,
} from "../lib/playlists";
import { useDownloadQueue } from "./download_queue_context";
import { DownloadPathContext } from "./download_path_context";
import { buildDownloadPayload } from "../lib/build_download_payload";
import { isFinished, isActive } from "../lib/download_status";
import { usePlayerDownloads } from "../hooks/use_player_downloads";
import {
  PREFETCH_KEY,
  countPlayerBusy,
  isRateLimitMessage,
  keepWindowIds,
  loadPrefetchPref,
  toPlaylistItem,
} from "../lib/player_helpers";

const PlayerSessionContext = createContext(null);

export function PlayerSessionProvider({ children }) {
  const { registerDownloadConfig, downloads } = useDownloadQueue();
  const { downloadPath } = useContext(DownloadPathContext);
  const [playlistState, setPlaylistState] = useState(() => loadPlaylists());
  /** Ephemeral play queue (sidebar). Not the same as saved offline playlists. */
  const [sessionQueue, setSessionQueue] = useState([]);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [mediaSrc, setMediaSrc] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [cacheJobId, setCacheJobId] = useState(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [prefetchEnabled, setPrefetchEnabledState] = useState(() => loadPrefetchPref());
  /** videoIds waiting to be promoted into a playlist after a cache job finishes */
  const prefetchIdRef = useRef(null);
  const pendingPlayKeyRef = useRef(null);
  const playlistStateRef = useRef(playlistState);
  playlistStateRef.current = playlistState;
  const sessionQueueRef = useRef(sessionQueue);
  sessionQueueRef.current = sessionQueue;

  const playlist = useMemo(() => activeList(playlistState), [playlistState]);
  const playlistsMeta = useMemo(() => listMeta(playlistState), [playlistState]);
  const activePlaylistId = playlistState.activeId || "default";
  const preparingCount = useMemo(() => countPlayerBusy(downloads), [downloads]);

  const persistPlaylists = useCallback((next) => {
    setPlaylistState(next);
    savePlaylists(next);
  }, []);

  const stopPlayback = useCallback(() => {
    pendingPlayKeyRef.current = null;
    setNowPlaying(null);
    setMediaSrc("");
    setStatus("idle");
    setError("");
    setCacheJobId(null);
  }, []);

  const noteRateLimit = useCallback((msg) => {
    if (!isRateLimitMessage(msg)) return;
    setRateLimited(true);
    setPrefetchEnabledState(false);
    try {
      localStorage.setItem(PREFETCH_KEY, "0");
    } catch {
      /* ignore */
    }
  }, []);

  const setPrefetchEnabled = useCallback((on) => {
    const next = Boolean(on);
    setPrefetchEnabledState(next);
    try {
      localStorage.setItem(PREFETCH_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const dismissRateLimit = useCallback(() => setRateLimited(false), []);

  const {
    savingIds,
    inflightRef,
    pendingPromoteRef,
    resolvePlayFile,
    startCacheJob,
    startPlaylistOfflineJob,
  } = usePlayerDownloads({
    registerDownloadConfig,
    activePlaylistId,
    rateLimited,
    noteRateLimit,
    setPlaylistState,
    downloads,
  });

  const reconcilePlaylist = useCallback(
    async (listId) => {
      if (!isTauri()) return;
      const slug = listId || playlistStateRef.current.activeId || "default";
      const diskIds = await invoke("list_playlist_video_ids", { slug }).catch(() => []);
      setPlaylistState((prev) => {
        const next = reconcileOffline(prev, slug, diskIds || []);
        if (next !== prev) savePlaylists(next);
        return next;
      });
    },
    [],
  );

  const selectPlaylist = useCallback(
    (id) => {
      persistPlaylists(setActivePlaylist(playlistStateRef.current, id));
      void reconcilePlaylist(id);
    },
    [persistPlaylists, reconcilePlaylist],
  );

  const createPlaylist = useCallback(
    async (name) => {
      const next = createList(playlistStateRef.current, name);
      if (next === playlistStateRef.current) return null;
      persistPlaylists(next);
      const slug = next.activeId;
      if (isTauri() && slug) {
        await invoke("playlist_dir", { slug }).catch(() => {});
      }
      return slug;
    },
    [persistPlaylists],
  );

  const renamePlaylist = useCallback(
    async (id, name) => {
      const { state, oldSlug, newSlug } = renamePlaylistWithSlug(
        playlistStateRef.current,
        id,
        name,
      );
      persistPlaylists(state);
      if (isTauri() && oldSlug && newSlug) {
        await invoke("rename_playlist_dir", { oldSlug, newSlug }).catch(() => {});
      }
    },
    [persistPlaylists],
  );

  const deletePlaylist = useCallback(
    async (id) => {
      const key = String(id || "");
      if (!key || key === "default") return;
      persistPlaylists(deleteList(playlistStateRef.current, key));
      if (isTauri()) {
        await invoke("delete_playlist_dir", { slug: key }).catch(() => {});
      }
    },
    [persistPlaylists],
  );

  const clearActivePlaylist = useCallback(
    async (wipeDisk = true) => {
      const slug = playlistStateRef.current.activeId || "default";
      persistPlaylists(clearPlaylistItems(playlistStateRef.current, slug));
      if (wipeDisk && isTauri()) {
        await invoke("clear_playlist_media", { slug }).catch(() => {});
      }
    },
    [persistPlaylists],
  );

  // Reconcile active list on mount
  useEffect(() => {
    void reconcilePlaylist(activePlaylistId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  const addToPlaylist = useCallback(
    async (video) => {
      const item = toPlaylistItem(video);
      if (!item.id) return;
      const state = playlistStateRef.current;
      persistPlaylists(addItem(state, item));
      try {
        await startPlaylistOfflineJob(item, state.activeId || "default");
      } catch (e) {
        const msg = typeof e === "string" ? e : e?.message;
        if (msg === "rateLimited" || isRateLimitMessage(msg)) {
          noteRateLimit(msg || "rateLimited");
        }
      }
    },
    [noteRateLimit, persistPlaylists, startPlaylistOfflineJob],
  );

  const removeFromPlaylist = useCallback(
    (id) => {
      const key = String(id);
      const slug = playlistStateRef.current.activeId || "default";
      persistPlaylists(removeItem(playlistStateRef.current, key));
      pendingPromoteRef.current.delete(key);
      if (isTauri()) {
        invoke("delete_playlist_file", { slug, videoId: key }).catch(() => {});
      }
      if (nowPlaying && itemKey(nowPlaying) === key) {
        stopPlayback();
      }
    },
    [persistPlaylists, nowPlaying, stopPlayback],
  );

  const pushSessionQueue = useCallback((item) => {
    if (!item?.id) return;
    setSessionQueue((q) => {
      if (q.some((x) => x.id === item.id)) return q;
      return [...q, item];
    });
  }, []);

  const clearSessionQueue = useCallback(() => {
    setSessionQueue([]);
    stopPlayback();
  }, [stopPlayback]);

  const requestPlayRef = useRef(null);
  const nowPlayingRef = useRef(nowPlaying);
  nowPlayingRef.current = nowPlaying;
  const statusRef = useRef(status);
  statusRef.current = status;

  const requestPlay = useCallback(
    async (video, opts = {}) => {
      const force = Boolean(opts?.force);
      const item = toPlaylistItem(video);
      if (!item.id) return;

      const current = nowPlayingRef.current;
      const st = statusRef.current;
      const sessionBusy =
        Boolean(current) &&
        (st === "playing" || st === "caching" || st === "waiting");

      // First track plays; further "Reproducir" from search only enqueue (don't cut).
      if (!force && sessionBusy) {
        if (item.id !== current.id) pushSessionQueue(item);
        return;
      }

      pushSessionQueue(item);
      pendingPlayKeyRef.current = item.id;
      setNowPlaying(item);
      setMediaSrc("");
      setError("");
      setCacheJobId(null);

      try {
        const existing = await resolvePlayFile(item.id);
        if (pendingPlayKeyRef.current !== item.id) return;
        if (existing) {
          setMediaSrc(convertFileSrc(existing));
          setStatus("playing");
          return;
        }

        if (rateLimited) {
          setStatus("error");
          setError("rateLimited");
          return;
        }

        const inflight = inflightRef.current.get(item.id);
        if (inflight?.processId != null) {
          setCacheJobId(String(inflight.processId));
          setStatus(
            countPlayerBusy(downloads) >= 1 && !isActive(downloads[inflight.processId]?.status)
              ? "waiting"
              : "caching",
          );
          return;
        }

        if (countPlayerBusy(downloads) >= 1) {
          setStatus("waiting");
        } else {
          setStatus("caching");
        }

        const processId = await startCacheJob(item);
        if (pendingPlayKeyRef.current !== item.id) return;
        if (!processId) {
          const again = await resolvePlayFile(item.id);
          if (again) {
            setMediaSrc(convertFileSrc(again));
            setStatus("playing");
          }
          return;
        }
        setCacheJobId(String(processId));
        setStatus("caching");
      } catch (e) {
        if (pendingPlayKeyRef.current !== item.id) return;
        const msg = typeof e === "string" ? e : e?.message || "cache failed";
        noteRateLimit(msg);
        setStatus("error");
        setError(msg);
      }
    },
    [downloads, noteRateLimit, pushSessionQueue, rateLimited, resolvePlayFile, startCacheJob],
  );
  requestPlayRef.current = requestPlay;

  const removeFromSessionQueue = useCallback(
    (videoId) => {
      const id = String(videoId || "");
      if (!id) return;
      const q = sessionQueueRef.current;
      const idx = q.findIndex((x) => x.id === id);
      const next = q.filter((x) => x.id !== id);
      setSessionQueue(next);
      if (nowPlaying?.id !== id) return;
      const candidate = next[idx] || next[Math.max(0, idx - 1)] || null;
      if (candidate) {
        void requestPlayRef.current?.(candidate, { force: true });
      } else {
        stopPlayback();
      }
    },
    [nowPlaying, stopPlayback],
  );

  // Resolve watched job → local media URL
  useEffect(() => {
    if (!cacheJobId || !nowPlaying) return undefined;
    const job = downloads[cacheJobId];
    if (!job) return undefined;
    if (String(job.status).startsWith("error") || job.status === "cancelled") {
      noteRateLimit(job.status);
      setStatus("error");
      setError(job.status || "error");
      setCacheJobId(null);
      return undefined;
    }
    if (!isFinished(job.status)) {
      if (countPlayerBusy(downloads) >= 1 && job.status === "queued") {
        setStatus("waiting");
      } else {
        setStatus("caching");
      }
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        let tryResolve = async () => {
          let existing = await resolvePlayFile(nowPlaying.id);
          if (existing) return existing;
          const raw = job.filename || "";
          if (raw && !/\.f\d+\./i.test(raw) && !raw.endsWith(".part")) return raw;
          return null;
        };
        let file = await tryResolve();
        // Brief retries: merge/rename can lag a tick on Windows.
        for (let i = 0; !file && i < 4; i += 1) {
          await new Promise((r) => setTimeout(r, 40));
          if (cancelled) return;
          file = await tryResolve();
        }
        if (cancelled) return;
        if (!file) {
          setStatus("error");
          setError("missing file");
          setCacheJobId(null);
          return;
        }
        setMediaSrc(convertFileSrc(file));
        setStatus("playing");
        setCacheJobId(null);
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(typeof e === "string" ? e : e?.message || "asset failed");
        setCacheJobId(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheJobId, downloads, nowPlaying, noteRateLimit, resolvePlayFile]);

  // Prefetch next — opt-in only; never when rate-limited
  useEffect(() => {
    if (!prefetchEnabled || rateLimited) return undefined;
    if (status !== "playing" || !nowPlaying || !isTauri()) return undefined;
    const idx = neighborIndex(sessionQueue, nowPlaying.id, 1);
    if (idx < 0) return undefined;
    const next = sessionQueue[idx];
    const key = itemKey(next);
    if (!key || prefetchIdRef.current === key) return undefined;
    prefetchIdRef.current = key;
    if (inflightRef.current.has(key)) return undefined;
    if (countPlayerBusy(downloads) >= 1) return undefined;
    (async () => {
      try {
        const existing = await resolvePlayFile(key);
        if (existing) return;
        await startCacheJob(next);
      } catch {
        /* prefetch best-effort */
      }
    })();
    return undefined;
  }, [
    prefetchEnabled,
    rateLimited,
    status,
    nowPlaying,
    sessionQueue,
    downloads,
    startCacheJob,
    resolvePlayFile,
  ]);

  useEffect(() => {
    if (!isTauri() || isMobile() || !nowPlaying || status !== "playing") return undefined;
    const keepIds = keepWindowIds(sessionQueue, nowPlaying.id);
    // Also keep anything currently downloading in cache
    for (const [videoId, meta] of inflightRef.current.entries()) {
      if (meta.purpose === "cache" && !keepIds.includes(videoId)) {
        keepIds.push(videoId);
      }
    }
    invoke("prune_player_cache", { keepIds }).catch(() => {});
    return undefined;
  }, [nowPlaying, status, sessionQueue]);

  useEffect(() => {
    if (!isTauri()) return undefined;
    invoke("purge_player_cache").catch(() => {});
    return undefined;
  }, []);

  const endSession = useCallback(() => {
    prefetchIdRef.current = null;
    setSessionQueue([]);
    stopPlayback();
    // Mobile: the play cache is the offline library, so it must persist between
    // sessions (cleared by the user per-item, never wiped on exit).
    if (isTauri() && !isMobile()) {
      invoke("clear_player_cache").catch(() => {});
    }
  }, [stopPlayback]);

  const playNext = useCallback(() => {
    if (!nowPlaying) return;
    const idx = neighborIndex(sessionQueue, nowPlaying.id, 1);
    if (idx < 0) return;
    requestPlay(sessionQueue[idx], { force: true });
  }, [nowPlaying, sessionQueue, requestPlay]);

  const playPrev = useCallback(() => {
    if (!nowPlaying) return;
    const idx = neighborIndex(sessionQueue, nowPlaying.id, -1);
    if (idx < 0) return;
    requestPlay(sessionQueue[idx], { force: true });
  }, [nowPlaying, sessionQueue, requestPlay]);

  const downloadAudio = useCallback(
    async (video) => {
      const item = toPlaylistItem(video || nowPlaying);
      if (!item?.id) return;
      let outputDir = String(downloadPath || "").trim();
      if (!outputDir) {
        // Mobile: no folder picker — the app-managed default (document_dir/Music)
        // is always writable. Desktop keeps the explicit-folder requirement.
        if (isMobile()) {
          outputDir = await invoke("resolve_download_dir");
        } else {
          throw new Error("needFolder");
        }
      }
      if (!String(outputDir || "").trim()) {
        throw new Error("needFolder");
      }
      // M4A + embedded tags for USB / BMW car stereos (title/artist/album; filename = title).
      const payload = buildDownloadPayload({
        formData: {
          embed_subtitles: false,
          embed_metadata: true,
          embed_thumbnail: false,
          output_ext: "m4a",
        },
        downloadPath: outputDir,
        formatId: "bestaudio/best",
        url: item.url,
        title: item.title,
        sourceExt: "webm",
      });
      if (!isTauri()) throw new Error("Tauri required");
      const processId = await invoke("start_download", { config: payload });
      registerDownloadConfig(processId, payload);
      return processId;
    },
    [downloadPath, nowPlaying, registerDownloadConfig],
  );

  const downloadVideo = useCallback(
    async (video) => {
      const item = toPlaylistItem(video || nowPlaying);
      if (!item?.id) return;
      if (!isTauri()) throw new Error("Tauri required");
      const keepDir = await invoke("player_keep_dir");
      const payload = {
        url: item.url,
        title: item.title || "",
        output_dir: keepDir,
        format: "bv*[height<=720]+ba/b",
        output_ext: null,
        embed_subtitles: false,
        embed_metadata: true,
        embed_thumbnail: false,
        purpose: "keep",
        ...cookieInvokeArgs(),
      };
      const processId = await invoke("start_download", { config: payload });
      registerDownloadConfig(processId, payload);
      return processId;
    },
    [nowPlaying, registerDownloadConfig],
  );

  const value = {
    nowPlaying,
    mediaSrc,
    status,
    error,
    playlist,
    sessionQueue,
    playlistsMeta,
    activePlaylistId,
    rateLimited,
    prefetchEnabled,
    preparingCount,
    savingIds,
    requestPlay,
    addToPlaylist,
    removeFromPlaylist,
    removeFromSessionQueue,
    clearSessionQueue,
    createPlaylist,
    selectPlaylist,
    renamePlaylist,
    deletePlaylist,
    clearActivePlaylist,
    setPrefetchEnabled,
    dismissRateLimit,
    playNext,
    playPrev,
    downloadAudio,
    downloadVideo,
    endSession,
  };

  return (
    <PlayerSessionContext.Provider value={value}>
      {children}
    </PlayerSessionContext.Provider>
  );
}

export function usePlayerSession() {
  const ctx = useContext(PlayerSessionContext);
  if (!ctx) {
    throw new Error("usePlayerSession outside provider");
  }
  return ctx;
}
