/**
 * Parse a progress string like "70%" or "70" into 0–100.
 * @param {unknown} value
 * @returns {number}
 */
export function parsePercentage(value) {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, value));
  }
  const raw = String(value).trim().replace(/%/g, "");
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
