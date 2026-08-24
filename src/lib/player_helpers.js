import { videoKey, extractYouTubeId } from "./youtube_id";
import { itemKey, neighborIndex } from "./playlists";
import { isActive } from "./download_status";

export const PREFETCH_KEY = "clip_harbour_player_prefetch";

export function isRateLimitMessage(msg) {
  const s = String(msg || "").toLowerCase();
  return (
    s.includes("rate-limited") ||
    s.includes("rate limited") ||
    s.includes("isn't available, try again later") ||
    s.includes("ha limitado esta sesión")
  );
}

export function loadPrefetchPref() {
  try {
    return localStorage.getItem(PREFETCH_KEY) === "1";
  } catch {
    return false;
  }
}

export function toPlaylistItem(video) {
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

export function keepWindowIds(playlist, currentId) {
  const ids = [];
  const prev = neighborIndex(playlist, currentId, -1);
  const next = neighborIndex(playlist, currentId, 1);
  if (prev >= 0) ids.push(itemKey(playlist[prev]));
  if (currentId) ids.push(String(currentId));
  if (next >= 0) ids.push(itemKey(playlist[next]));
  return ids.filter(Boolean);
}

export function countPlayerBusy(downloads) {
  return Object.values(downloads).filter((d) => isActive(d.status)).length;
}
