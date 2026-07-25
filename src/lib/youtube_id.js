/**
 * Extract an 11-char YouTube video id from a URL or bare id string.
 * @param {string | null | undefined} urlOrId
 * @returns {string | null}
 */
export function extractYouTubeId(urlOrId) {
  if (!urlOrId) return null;
  const value = String(urlOrId).trim();
  if (!value) return null;

  if (/^[\w-]{11}$/.test(value)) return value;

  let url = value;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url.replace(/^\/\//, "")}`;
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id?.length === 11 ? id : null;
    }

    const fromQuery = parsed.searchParams.get("v");
    if (fromQuery?.length === 11) return fromQuery;

    const shorts = parsed.pathname.match(/\/shorts\/([\w-]{11})/);
    if (shorts) return shorts[1];

    const live = parsed.pathname.match(/\/live\/([\w-]{11})/);
    if (live) return live[1];

    const embed = parsed.pathname.match(/\/embed\/([\w-]{11})/);
    if (embed) return embed[1];
  } catch {
    /* ignore malformed URLs */
  }

  return null;
}

/**
 * Stable key for deduplicating videos in search and bulk selection.
 * @param {{ url?: string, id?: string, title?: string } | null | undefined} video
 * @returns {string | null}
 */
export function videoKey(video) {
  if (!video) return null;
  return (
    extractYouTubeId(video.url) ||
    extractYouTubeId(video.id) ||
    video.url ||
    video.id ||
    video.title ||
    null
  );
}
