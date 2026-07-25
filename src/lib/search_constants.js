export const SEARCH_LOADING_SENTINEL = "__clip_harbour_loading__";

/** yt-dlp ytsearchN batch sizes (not UI rows-per-page). */
export const SEARCH_FETCH_INITIAL = 50;
export const SEARCH_FETCH_MAX = 100;

/** Fallback when the list viewport has not been measured yet. */
export const SEARCH_PAGE_SIZE = 15;
export const SEARCH_ROW_HEIGHT_PX = 40;
export const SEARCH_PAGE_SIZE_MIN = 8;
export const SEARCH_PAGE_SIZE_MAX = 30;
/** Fixed pagination bar height — pinned to the bottom of the results panel. */
export const SEARCH_PAGINATION_HEIGHT_PX = 32;

/** Shared list + header grid so columns stay aligned. */
export const SEARCH_RESULT_GRID =
  "grid grid-cols-[1.5rem_minmax(0,2.2fr)_minmax(0,1fr)_4.75rem] items-center gap-x-2 px-2";

export const FORMAT_PAGE_SIZE = 12;
export const QUEUE_PAGE_SIZE = 6;

/**
 * How many fixed-height rows fit in the list viewport (pagination excluded).
 * Intended for a **one-shot** measure when results appear — not for continuous
 * resize updates (AG Grid-style fixed paginationPageSize after first fit).
 * @returns {number}
 */
export function pageSizeForListHeight(heightPx, rowHeightPx = SEARCH_ROW_HEIGHT_PX) {
  if (!heightPx || heightPx <= 0) return SEARCH_PAGE_SIZE;
  const pageSize = Math.floor(heightPx / rowHeightPx);
  return Math.max(SEARCH_PAGE_SIZE_MIN, Math.min(SEARCH_PAGE_SIZE_MAX, pageSize));
}

/**
 * Whether the UI should measure and apply a new pageSize.
 * Once locked, resizes must not change pageSize; a new search unlocks first.
 * @param {{ locked: boolean, isNewSearch?: boolean }} opts
 */
export function shouldRecalcPageSize({ locked, isNewSearch = false }) {
  if (isNewSearch) return false;
  return !locked;
}

/**
 * @deprecated prefer {@link pageSizeForListHeight}
 * @returns {{ pageSize: number, paginationPx: number }}
 */
export function layoutForSearchHeight(heightPx, rowHeightPx = SEARCH_ROW_HEIGHT_PX) {
  return {
    pageSize: pageSizeForListHeight(heightPx, rowHeightPx),
    paginationPx: SEARCH_PAGINATION_HEIGHT_PX,
  };
}

/**
 * @deprecated prefer {@link pageSizeForListHeight}
 */
export function pageSizeForHeight(heightPx, rowHeightPx = SEARCH_ROW_HEIGHT_PX) {
  return pageSizeForListHeight(heightPx, rowHeightPx);
}
