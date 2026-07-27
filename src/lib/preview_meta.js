/**
 * Format yt-dlp upload_date (`YYYYMMDD`) for display.
 * @param {string | null | undefined} raw
 * @param {string} [locale]
 * @returns {string | null}
 */
export function formatUploadDate(raw, locale = "es") {
  if (!raw || typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return raw.trim() || null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(date.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
}

/**
 * @param {number | null | undefined} n
 * @param {string} [locale]
 * @returns {string | null}
 */
export function formatCount(n, locale = "es") {
  if (n == null || !Number.isFinite(Number(n))) return null;
  try {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
      Number(n),
    );
  } catch {
    return String(n);
  }
}
