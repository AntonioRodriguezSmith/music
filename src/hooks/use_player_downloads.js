import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { cookieInvokeArgs } from "../lib/cookies_prefs";
import { isTauri } from "../lib/tauri_env";
import { markOffline, savePlaylists } from "../lib/playlists";
import { isFinished } from "../lib/download_status";
import { toPlaylistItem } from "../lib/player_helpers";

/**
 * Player cache / offline download orchestration, extracted from
 * `player_session_context.jsx`. Owns the download-tracking refs and the
 * "mark offline / promote cache→playlist" effect. The parent provider keeps
 * playback/session concerns and consumes the returned handlers.
 *
 * @param {object} deps
 * @param {(id: unknown, cfg: object) => void} deps.registerDownloadConfig
 * @param {string} deps.activePlaylistId
 * @param {boolean} deps.rateLimited
 * @param {(msg: unknown) => void} deps.noteRateLimit
 * @param {import("react").Dispatch<import("react").SetStateAction<unknown>>} deps.setPlaylistState
 * @param {Record<string, object>} deps.downloads
 */
export function usePlayerDownloads({
  registerDownloadConfig,
  activePlaylistId,
  rateLimited,
  noteRateLimit,
  setPlaylistState,
  downloads,
}) {
  /** videoIds currently saving offline (playlist job or pending promote) */
  const [savingIds, setSavingIds] = useState(() => new Set());
  /** videoId → { processId, purpose, listId? } — one download per video */
  const inflightRef = useRef(new Map());
  /** processId → { listId, videoId } for offline flag when playlist purpose finishes */
  const playlistJobsRef = useRef(new Map());
  /** videoIds waiting to be promoted into a playlist after a cache job finishes */
  const pendingPromoteRef = useRef(new Map()); // videoId → listId

  const markItemOffline = useCallback(
    (listId, videoId) => {
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
    },
    [setPlaylistState],
  );

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

  const clearInflight = useCallback((videoId, processId) => {
    const cur = inflightRef.current.get(String(videoId));
    if (cur && String(cur.processId) === String(processId)) {
      inflightRef.current.delete(String(videoId));
    }
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

  return {
    savingIds,
    inflightRef,
    pendingPromoteRef,
    resolvePlayFile,
    startCacheJob,
    startPlaylistOfflineJob,
  };
}
