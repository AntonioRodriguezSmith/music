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
import { videoKey } from "../lib/youtube_id";
import {
  activeList,
  addToPlaylist as addItem,
  loadPlaylists,
  neighborIndex,
  removeFromPlaylist as removeItem,
  reorderPlaylist,
  savePlaylists,
  itemKey,
} from "../lib/playlists";
import { useDownloadQueue } from "./download_queue_context";
import { DownloadPathContext } from "./download_path_context";
import { buildDownloadPayload } from "../lib/build_download_payload";
import { isFinished, isActive } from "../lib/download_status";

const PlayerSessionContext = createContext(null);

function toPlaylistItem(video) {
  const id = videoKey(video) || video?.url || "";
  return {
    id,
    title: video?.title || id,
    url: video?.url || id,
    thumbnail: video?.thumbnail || "",
    uploader: video?.uploader || video?.channel || "",
  };
}

export function PlayerSessionProvider({ children }) {
  const { registerDownloadConfig, downloads } = useDownloadQueue();
  const { downloadPath } = useContext(DownloadPathContext);
  const [playlistState, setPlaylistState] = useState(() => loadPlaylists());
  const [nowPlaying, setNowPlaying] = useState(null);
  const [mediaSrc, setMediaSrc] = useState("");
  const [status, setStatus] = useState("idle"); // idle|waiting|caching|playing|error
  const [error, setError] = useState("");
  const [cacheJobId, setCacheJobId] = useState(null);
  const prefetchIdRef = useRef(null);
  const pendingPlayKeyRef = useRef(null);

  const playlist = useMemo(() => activeList(playlistState), [playlistState]);

  const persistPlaylists = useCallback((next) => {
    setPlaylistState(next);
    savePlaylists(next);
  }, []);

  const addToPlaylist = useCallback(
    (video) => {
      persistPlaylists(addItem(playlistState, toPlaylistItem(video)));
    },
    [persistPlaylists, playlistState],
  );

  const removeFromPlaylist = useCallback(
    (id) => {
      persistPlaylists(removeItem(playlistState, id));
    },
    [persistPlaylists, playlistState],
  );

  const movePlaylistItem = useCallback(
    (fromIndex, toIndex) => {
      persistPlaylists(reorderPlaylist(playlistState, fromIndex, toIndex));
    },
    [persistPlaylists, playlistState],
  );

  const startCacheJob = useCallback(
    async (video) => {
      if (!isTauri()) {
        throw new Error("Player cache requires Tauri");
      }
      const cacheDir = await invoke("player_cache_dir");
      const payload = {
        url: video.url || video.id,
        title: video.title || "",
        output_dir: cacheDir,
        format: "bv*[height<=720]+ba/b",
        output_ext: "mp4",
        embed_subtitles: false,
        embed_metadata: false,
        embed_thumbnail: false,
        purpose: "cache",
        ...cookieInvokeArgs(),
      };
      const processId = await invoke("start_download", { config: payload });
      registerDownloadConfig(processId, payload);
      return processId;
    },
    [registerDownloadConfig],
  );

  const requestPlay = useCallback(
    async (video) => {
      const item = toPlaylistItem(video);
      if (!item.id) return;
      pendingPlayKeyRef.current = item.id;
      setNowPlaying(item);
      setMediaSrc("");
      setError("");
      addToPlaylist(item);

      const activeCount = Object.values(downloads).filter((d) => isActive(d.status)).length;
      if (activeCount >= 2) {
        setStatus("waiting");
      } else {
        setStatus("caching");
      }

      try {
        const processId = await startCacheJob(item);
        if (pendingPlayKeyRef.current !== item.id) return;
        setCacheJobId(String(processId));
        setStatus("caching");
      } catch (e) {
        if (pendingPlayKeyRef.current !== item.id) return;
        setStatus("error");
        setError(typeof e === "string" ? e : e?.message || "cache failed");
      }
    },
    [addToPlaylist, downloads, startCacheJob],
  );

  // Resolve cache job → local media URL
  useEffect(() => {
    if (!cacheJobId || !nowPlaying) return;
    const job = downloads[cacheJobId];
    if (!job) return;
    if (String(job.status).startsWith("error") || job.status === "cancelled") {
      setStatus("error");
      setError(job.status || "error");
      setCacheJobId(null);
      return;
    }
    if (!isFinished(job.status)) {
      const activeCount = Object.values(downloads).filter((d) => isActive(d.status)).length;
      if (activeCount >= 2 && job.status === "queued") {
        setStatus("waiting");
      } else {
        setStatus("caching");
      }
      return;
    }
    const file = job.filename;
    if (!file) {
      setStatus("error");
      setError("missing file");
      setCacheJobId(null);
      return;
    }
    try {
      setMediaSrc(convertFileSrc(file));
      setStatus("playing");
    } catch (e) {
      setStatus("error");
      setError(typeof e === "string" ? e : e?.message || "asset failed");
    }
    setCacheJobId(null);
  }, [cacheJobId, downloads, nowPlaying]);

  // Prefetch next playlist item once
  useEffect(() => {
    if (status !== "playing" || !nowPlaying || !isTauri()) return undefined;
    const idx = neighborIndex(playlist, nowPlaying.id, 1);
    if (idx < 0) return undefined;
    const next = playlist[idx];
    const key = itemKey(next);
    if (!key || prefetchIdRef.current === key) return undefined;
    prefetchIdRef.current = key;
    const activeCount = Object.values(downloads).filter((d) => isActive(d.status)).length;
    if (activeCount >= 2) return undefined;
    startCacheJob(next).catch(() => {
      /* prefetch best-effort */
    });
    return undefined;
  }, [status, nowPlaying, playlist, downloads, startCacheJob]);

  // Purge LRU on mount
  useEffect(() => {
    if (!isTauri()) return undefined;
    invoke("purge_player_cache").catch(() => {});
    return undefined;
  }, []);

  const playNext = useCallback(() => {
    if (!nowPlaying) return;
    const idx = neighborIndex(playlist, nowPlaying.id, 1);
    if (idx < 0) return;
    requestPlay(playlist[idx]);
  }, [nowPlaying, playlist, requestPlay]);

  const playPrev = useCallback(() => {
    if (!nowPlaying) return;
    const idx = neighborIndex(playlist, nowPlaying.id, -1);
    if (idx < 0) return;
    requestPlay(playlist[idx]);
  }, [nowPlaying, playlist, requestPlay]);

  const downloadAudio = useCallback(
    async (video) => {
      const item = toPlaylistItem(video || nowPlaying);
      if (!item?.id) return;
      if (!String(downloadPath || "").trim()) {
        throw new Error("needFolder");
      }
      const payload = buildDownloadPayload({
        formData: {
          embed_subtitles: false,
          embed_metadata: true,
          embed_thumbnail: false,
          output_ext: null,
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

  const value = {
    nowPlaying,
    mediaSrc,
    status,
    error,
    playlist,
    requestPlay,
    addToPlaylist,
    removeFromPlaylist,
    movePlaylistItem,
    playNext,
    playPrev,
    downloadAudio,
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
