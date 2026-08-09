/**
 * Display-only helpers for Player visualization metadata.
 * Does not mutate stored playlist / download metadata.
 */

/** Decorative punctuation removed from title / artist / album for on-screen text. */
const DECORATIVE_PUNCT_RE =
  /[''`´\u2018\u2019\u201A\u201B\u2032\u2035"\u201C\u201D\u201E\u201F\u2033\u2036«»„‚.?¿!¡…]+/g;

/** Fold accents / ñ for display only (Á→A, ñ→n). */
const ACCENT_FOLD_MAP = {
  Á: "A",
  À: "A",
  Ä: "A",
  Â: "A",
  Ã: "A",
  Å: "A",
  á: "a",
  à: "a",
  ä: "a",
  â: "a",
  ã: "a",
  å: "a",
  É: "E",
  È: "E",
  Ë: "E",
  Ê: "E",
  é: "e",
  è: "e",
  ë: "e",
  ê: "e",
  Í: "I",
  Ì: "I",
  Ï: "I",
  Î: "I",
  í: "i",
  ì: "i",
  ï: "i",
  î: "i",
  Ó: "O",
  Ò: "O",
  Ö: "O",
  Ô: "O",
  Õ: "O",
  ó: "o",
  ò: "o",
  ö: "o",
  ô: "o",
  õ: "o",
  Ú: "U",
  Ù: "U",
  Ü: "U",
  Û: "U",
  ú: "u",
  ù: "u",
  ü: "u",
  û: "u",
  Ý: "Y",
  ÿ: "y",
  ý: "y",
  Ñ: "N",
  ñ: "n",
};
const ACCENT_FOLD_RE = new RegExp(`[${Object.keys(ACCENT_FOLD_MAP).join("")}]`, "g");

/**
 * Strip quotes, periods, ¿¡?! and similar decorative symbols for UI display.
 * Folds accents (Á→A) and ñ→n. Keeps letters, numbers, spaces, and separators (- & , /).
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeDisplayText(value) {
  if (value == null) return "";
  return String(value)
    .replace(ACCENT_FOLD_RE, (ch) => ACCENT_FOLD_MAP[ch] || ch)
    .replace(DECORATIVE_PUNCT_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {number} totalSeconds
 * @returns {string}
 */
function secondsToClock(totalSeconds) {
  const total = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Format duration for display (mm:ss or h:mm:ss). Pass-through for already-clock strings.
 * @param {unknown} duration
 * @returns {string}
 */
export function formatDurationDisplay(duration) {
  if (duration == null || duration === "") return "";
  if (typeof duration === "number" && Number.isFinite(duration)) {
    return secondsToClock(duration);
  }
  const raw = String(duration).trim();
  if (!raw) return "";
  if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(raw)) return raw;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return secondsToClock(asNumber);
  return raw;
}

const MARKETING_RE =
  /\s*[\(\[](?:official\s*)?(?:video|audio|visualizer|lyric\s*video|music\s*video|video oficial|audio oficial|official audio|official video|video visual|short film|videoclip)[^\)\]]*[\)\]]/gi;
const YOUTUBE_ID_RE = /\s*\[[\w-]{11}\]\s*$/g;
const PROD_CREDIT_RE =
  /\s*\((?:prod\.?\s*by|produced by|shot by|video by)[^)]*\)/gi;

/**
 * Parse YouTube-style "Artist - Title | Album" into BMW display fields.
 * Does not mutate stored playlist data.
 * @param {{
 *   title?: string,
 *   artist?: string,
 *   uploader?: string,
 *   channel?: string,
 *   album?: string,
 * } | null | undefined} track
 * @returns {{ title: string, artists: string, album: string }}
 */
export function parseTrackDisplayFields(track) {
  if (!track) return { title: "", artists: "", album: "" };

  let rawTitle = String(track.title || "").trim();
  let artists = String(track.artist || track.uploader || track.channel || "").trim();
  let album = String(track.album || "").trim();

  rawTitle = rawTitle
    .replace(YOUTUBE_ID_RE, "")
    .replace(MARKETING_RE, "")
    .replace(PROD_CREDIT_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Artist - Title | Album
  const artistTitle = rawTitle.match(
    /^(.+?)\s*[-–—]\s+(.+?)(?:\s*[\u007C\uFF5C/]\s*(.+))?$/,
  );
  if (artistTitle) {
    const maybeArtist = artistTitle[1].trim();
    const restTitle = artistTitle[2].trim();
    const maybeAlbum = (artistTitle[3] || "").trim();
    if (maybeArtist && restTitle && maybeArtist.length < 80) {
      if (!artists) artists = maybeArtist;
      rawTitle = restTitle;
      if (!album && maybeAlbum) album = maybeAlbum;
    }
  } else {
    const titleAlbum = rawTitle.match(/^(.+?)\s*[\u007C\uFF5C/]\s*(.+)$/);
    if (titleAlbum) {
      rawTitle = titleAlbum[1].trim();
      if (!album) album = titleAlbum[2].trim();
    }
  }

  // feat. in title → artists
  const featParen = rawTitle.match(
    /^(.+?)\s*\((?:ft\.?|feat\.?|featuring)\s+([^)]+)\)\s*$/i,
  );
  const featInline = !featParen
    ? rawTitle.match(/^(.+?)\s+(?:ft\.?|feat\.?|featuring)\s+(.+)$/i)
    : null;
  const featMatch = featParen || featInline;
  if (featMatch) {
    rawTitle = featMatch[1].trim();
    const feat = featMatch[2].trim();
    if (feat) {
      if (artists && !/(?:ft\.?|feat\.?)/i.test(artists) && !artists.includes(feat)) {
        artists = `${artists} ft. ${feat}`;
      } else if (!artists) {
        artists = feat;
      }
    }
  }

  return {
    title: sanitizeDisplayText(rawTitle),
    artists: sanitizeDisplayText(artists),
    album: sanitizeDisplayText(album),
  };
}

/**
 * Build visualization line: Title - Interpreters - Album - Duration
 * Omits empty segments (no trailing " - - ").
 * @param {{
 *   title?: string,
 *   artist?: string,
 *   uploader?: string,
 *   channel?: string,
 *   album?: string,
 *   duration?: string | number,
 *   duration_raw?: number,
 * } | null | undefined} track
 * @returns {string}
 */
export function formatNowPlayingDisplay(track) {
  if (!track) return "";
  const { title, artists, album } = parseTrackDisplayFields(track);
  const duration = formatDurationDisplay(
    track.duration != null && track.duration !== ""
      ? track.duration
      : track.duration_raw,
  );
  return [title, artists, album, duration].filter(Boolean).join(" - ");
}
