/**
 * Classify search-bar input as YouTube URL or free-text search.
 * @param {string} input
 * @returns {{ type: "url", url: string } | { type: "search", query: string } | null}
 */
export function resolveInput(input) {
  const value = String(input ?? "").trim();
  if (!value) return null;

  // Bare YouTube video id
  if (/^[\w-]{11}$/.test(value)) {
    return { type: "url", url: `https://www.youtube.com/watch?v=${value}` };
  }

  const looksLikeUrl =
    /^https?:\/\//i.test(value) ||
    /^(www\.)?(m\.|music\.)?youtube\.com\b/i.test(value) ||
    /^youtu\.be\//i.test(value) ||
    /youtube\.com\/(watch|shorts|playlist|live)/i.test(value) ||
    /youtu\.be\//i.test(value);

  if (!looksLikeUrl) {
    return { type: "search", query: value };
  }

  let url = value;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url.replace(/^\/\//, "")}`;
  }

  return { type: "url", url };
}
