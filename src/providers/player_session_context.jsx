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
import { isTauri } from "../lib/tauri_env";
import { videoKey, extractYouTubeId } from "../lib/youtube_id";
import {
  activeList,
  addToPlaylist as addItem,
  clearPlaylistItems,
  createPlaylist as createList,
  deletePlaylist as deleteList,
  listMeta,
  loadPlaylists,
  markOffline,
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

const PlayerSessionContext = createContext(null);
const PREFETCH_KEY = "clip_harbour_player_prefetch";

function isRateLimitMessage(msg) {
  const s = String(msg || "").toLowerCase();
  return (
    s.includes("rate-limited") ||
    s.includes("rate limited") ||
    s.includes("isn't available, try again later") ||
    s.includes("ha limitado esta sesión")
  );
}

function loadPrefetchPref() {
  try {
    return localStorage.getItem(PREFETCH_KEY) === "1";
  } catch {
    return false;
  }
}

function toPlaylistItem(video) {
  const id = videoKey(video) || extractYouTubeId(video?.url) || video?.url || "";
  const rawUrl = String(video?.url || id || "").trim();
  const url = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : id
      ? `https://www.youtube.com/watch?v=${id}`
      : rawUrl;
  return {
    id,
    title: video?.title || id,
    url,
    thumbnail: video?.thumbnail || "",
    uploader: video?.uploader || video?.channel || "",
    duration: video?.duration || "",
    offline: Boolean(video?.offline),
  };
}

function keepWindowIds(playlist, currentId) {
  const ids = [];
  const prev = neighborIndex(playlist, currentId, -1);
  const next = neighborIndex(playlist, currentId, 1);
  if (prev >= 0) ids.push(itemKey(playlist[prev]));
  if (currentId) ids.push(String(currentId));
  if (next >= 0) ids.push(itemKey(playlist[next]));
  return ids.filter(Boolean);
}

function countPlayerBusy(downloads) {
  return Object.values(downloads).filter((d) => isActive(d.status)).length;
}

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
  /** videoIds currently saving offline (playlist job or pending promote) */
  const [savingIds, setSavingIds] = useState(() => new Set());
  /** videoId → { processId, purpose, listId? } — one download per video */
  const inflightRef = useRef(new Map());
  /** processId → { listId, videoId } for offline flag when playlist purpose finishes */
  const playlistJobsRef = useRef(new Map());
  /** videoIds waiting to be promoted into a playlist after a cache job finishes */
  const pendingPromoteRef = useRef(new Map()); // videoId → listId
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

  const markItemOffline = useCallback((listId, videoId) => {
    setPlaylistState((prev) => {
      const next = markOffline(prev, listId, videoId, true);
      savePlaylists(next);
      return next;
    });
    if (isTauri()) {
      invoke("append_playlist_archive", { slug: listId, videoId }).catch(() => {});
    }
    setSavingIds((prev) => {
      if (!prev.has(videoId)) return prev;
      const n = new Set(prev);
      n.delete(videoId);
      return n;
    });
  }, []);

  const markSaving = useCallback((videoId, on) => {
    setSavingIds((prev) => {
      const has = prev.has(videoId);
      if (on && has) return prev;
      if (!on && !has) return prev;
      const n = new Set(prev);
      if (on) n.add(videoId);
      else n.delete(videoId);
      return n;
    });
  }, []);

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

  const clearInflight = useCallback((videoId, processId) => {
    const cur = inflightRef.current.get(String(videoId));
    if (cur && String(cur.processId) === String(processId)) {
      inflightRef.current.delete(String(videoId));
    }
  }, []);

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

  const resolvePlayFile = useCallback(
    async (videoId) => {
      if (!isTauri()) return null;
      return invoke("resolve_player_cache_file", {
        videoId,
        activeSlug: activePlaylistId,
      });
    },
    [activePlaylistId],
  );

  const tryPromoteToPlaylist = useCallback(
    async (slug, videoId) => {
      if (!isTauri() || !slug || !videoId) return false;
      const path = await invoke("promote_to_playlist", { slug, videoId }).catch(() => null);
      if (path) {
        markItemOffline(slug, videoId);
        return true;
      }
      return false;
    },
    [markItemOffline],
  );

  const startCacheJob = useCallback(
    async (video) => {
      if (!isTauri()) throw new Error("Player cache requires Tauri");
      const item = toPlaylistItem(video);
      if (!item.id) return null;

      const existing = await resolvePlayFile(item.id);
      if (existing) return null;

      const inflight = inflightRef.current.get(item.id);
      if (inflight?.processId != null) {
        return String(inflight.processId);
      }

      const cacheDir = await invoke("player_cache_dir");
      const payload = {
        url: item.url || item.id,
        title: item.title || "",
        output_dir: cacheDir,
        // Prefer progressive mp4 when available (one stream, no merge wait).
        format: "b[height<=720][ext=mp4]/bv*[height<=720]+ba/b",
        output_ext: null,
        embed_subtitles: false,
        embed_metadata: false,
        embed_thumbnail: false,
        purpose: "cache",
        ...cookieInvokeArgs(),
      };
      const processId = await invoke("start_download", { config: payload });
      const id = String(processId);
      registerDownloadConfig(processId, payload);
      inflightRef.current.set(item.id, { processId: id, purpose: "cache" });
      return id;
    },
    [registerDownloadConfig, resolvePlayFile],
  );

  const startPlaylistOfflineJob = useCallback(
    async (video, listId) => {
      if (!isTauri()) return null;
      const item = toPlaylistItem(video);
      if (!item.id) return null;
      const slug = listId || activePlaylistId;

      const already = await invoke("resolve_playlist_file", {
        slug,
        videoId: item.id,
      }).catch(() => null);
      if (already) {
        markItemOffline(slug, item.id);
        return null;
      }

      // Reuse disk copy from cache/elsewhere — no second download.
      markSaving(item.id, true);
      if (await tryPromoteToPlaylist(slug, item.id)) {
        return null;
      }

      const inflight = inflightRef.current.get(item.id);
      if (inflight?.processId != null) {
        // Same video already downloading (usually cache for play) — promote when done.
        pendingPromoteRef.current.set(item.id, slug);
        if (inflight.purpose === "playlist") {
          playlistJobsRef.current.set(String(inflight.processId), {
            listId: slug,
            videoId: item.id,
          });
        }
        return String(inflight.processId);
      }

      if (rateLimited) {
        markSaving(item.id, false);
        throw new Error("rateLimited");
      }

      const dir = await invoke("playlist_dir", { slug });
      const payload = {
        url: item.url || item.id,
        title: item.title || "",
        output_dir: dir,
        format: "bv*[height<=720]+ba/b",
        output_ext: null,
        embed_subtitles: false,
        embed_metadata: false,
        embed_thumbnail: false,
        purpose: "playlist",
        ...cookieInvokeArgs(),
      };
      const processId = await invoke("start_download", { config: payload });
      const id = String(processId);
      registerDownloadConfig(processId, payload);
      inflightRef.current.set(item.id, { processId: id, purpose: "playlist", listId: slug });
      playlistJobsRef.current.set(id, { listId: slug, videoId: item.id });
      markSaving(item.id, true);
      return id;
    },
    [
      activePlaylistId,
      markItemOffline,
      markSaving,
      rateLimited,
      registerDownloadConfig,
      tryPromoteToPlaylist,
    ],
  );

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

  // Track download completion: clear inflight, mark offline, promote cache→playlist
  useEffect(() => {
    for (const [videoId, meta] of [...inflightRef.current.entries()]) {
      const job = downloads[meta.processId];
      if (!job) continue;
      if (isFinished(job.status)) {
        clearInflight(videoId, meta.processId);
        if (meta.purpose === "playlist") {
          const pj = playlistJobsRef.current.get(meta.processId);
          if (pj) {
            markItemOffline(pj.listId, pj.videoId);
            playlistJobsRef.current.delete(meta.processId);
          }
        }
        const promoteSlug = pendingPromoteRef.current.get(videoId);
        if (promoteSlug) {
          pendingPromoteRef.current.delete(videoId);
          tryPromoteToPlaylist(promoteSlug, videoId).catch(() => {});
        }
      } else if (
        job.status === "cancelled" ||
        String(job.status).startsWith("error")
      ) {
        clearInflight(videoId, meta.processId);
        playlistJobsRef.current.delete(meta.processId);
        pendingPromoteRef.current.delete(videoId);
        noteRateLimit(job.status);
        markSaving(videoId, false);
      }
    }

    for (const [jobId, meta] of [...playlistJobsRef.current.entries()]) {
      const job = downloads[jobId];
      if (!job) continue;
      if (isFinished(job.status)) {
        markItemOffline(meta.listId, meta.videoId);
        playlistJobsRef.current.delete(jobId);
      } else if (
        job.status === "cancelled" ||
        String(job.status).startsWith("error")
      ) {
        playlistJobsRef.current.delete(jobId);
        noteRateLimit(job.status);
        markSaving(meta.videoId, false);
      }
    }
  }, [downloads, clearInflight, markItemOffline, markSaving, noteRateLimit, tryPromoteToPlaylist]);

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
    if (!isTauri() || !nowPlaying || status !== "playing") return undefined;
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
    if (isTauri()) {
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
      if (!String(downloadPath || "").trim()) {
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
        downloadPath,
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
