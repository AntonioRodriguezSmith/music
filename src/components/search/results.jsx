import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useVideo } from "../../providers/video_context";
import { videoKey } from "../../lib/youtube_id";
import { isTauri } from "../../lib/tauri_env";
import {
  SEARCH_LOADING_SENTINEL,
  SEARCH_PAGE_SIZE,
  SEARCH_PAGINATION_HEIGHT_PX,
  SEARCH_RESULT_GRID,
  SEARCH_ROW_HEIGHT_PX,
  pageSizeForListHeight,
  shouldRecalcPageSize,
} from "../../lib/search_constants";
import { cookieInvokeArgs } from "../../lib/cookies_prefs";
import { extractYouTubeId } from "../../lib/youtube_id";
import { formatCount, formatUploadDate } from "../../lib/preview_meta";
import i18n from "../../i18n";

export default function SearchResults({ open }) {
  const { t } = useTranslation();
  const [curr, setCurr] = useState(0);
  const [configuring, setConfiguring] = useState(false);
  const [pageSize, setPageSize] = useState(SEARCH_PAGE_SIZE);
  const listRef = useRef(null);
  const pageSizeLockedRef = useRef(false);
  const navigate = useNavigate();
  const {
    setSelectedVideo,
    searchResults,
    bulkSelection,
    toggleBulkItem,
    isBulkSelected,
    setBulkSelection,
    clearBulkSelection,
    searchPage,
    setSearchPage,
    enrichVideoDetails,
    enrichingKey,
    canLoadMore,
    loadMoreSearch,
    loadingMore,
  } = useVideo();

  const isLoading =
    searchResults?.length === 1 && searchResults[0]?.title === SEARCH_LOADING_SENTINEL;

  const realResults = isLoading ? [] : searchResults || [];
  const totalPages = Math.max(1, Math.ceil(realResults.length / pageSize));
  const page = Math.min(searchPage, totalPages - 1);

  const pageItems = useMemo(
    () => realResults.slice(page * pageSize, page * pageSize + pageSize),
    [realResults, page, pageSize],
  );
  const firstPageItemKey = pageItems[0] ? videoKey(pageItems[0]) : null;
  const previewItem = pageItems[curr] ?? pageItems[0];
  const previewKey = previewItem ? videoKey(previewItem) : null;

  useEffect(() => {
    if (!previewItem || isLoading || !isTauri()) return undefined;
    const timer = setTimeout(() => {
      enrichVideoDetails(previewItem);
    }, 400);
    return () => clearTimeout(timer);
  }, [previewKey, isLoading, enrichVideoDetails, previewItem]);

  // New search unlocks so we re-measure once at the current window size.
  useEffect(() => {
    if (isLoading) {
      pageSizeLockedRef.current = false;
    }
  }, [isLoading]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;

    const tryLock = () => {
      if (
        !shouldRecalcPageSize({
          locked: pageSizeLockedRef.current,
          isNewSearch: isLoading,
        })
      ) {
        return true;
      }
      const height = el.clientHeight;
      if (height <= 0) return false;
      const nextSize = pageSizeForListHeight(height);
      setPageSize((prev) => (prev === nextSize ? prev : nextSize));
      pageSizeLockedRef.current = true;
      return true;
    };

    if (tryLock()) return undefined;

    const ro = new ResizeObserver(() => {
      if (tryLock()) ro.disconnect();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoading, searchResults]);

  useEffect(() => {
    if (searchPage > totalPages - 1) {
      setSearchPage(Math.max(0, totalPages - 1));
    }
  }, [searchPage, totalPages, setSearchPage]);

  useEffect(() => {
    setCurr(0);
  }, [page, firstPageItemKey]);

  useEffect(() => {
    setCurr((prev) => Math.min(prev, Math.max(0, pageItems.length - 1)));
  }, [pageItems.length]);

  if (!isTauri()) {
    return (
      <div className="ml-4 max-w-xl text-base leading-relaxed text-[#333] p-4">
        <p className="font-semibold mb-2">{t("search.browserHintTitle")}</p>
        <p>{t("search.browserHintBody")}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4 w-full overflow-hidden">
        {[...Array(5)].map((_, index) => (
          <div
            key={index}
            className="animate-pulse flex items-center gap-4 border-b border-gray-200 p-3 w-full"
          >
            <div className="h-10 w-32 bg-gray-200 rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!searchResults) {
    return (
      <div className="flex-1 flex items-start justify-center pt-8 px-4">
        <p className="text-sm text-[#555] text-center max-w-md leading-relaxed">
          {t("search.noResultsYet")}
        </p>
      </div>
    );
  }

  if (searchResults.length === 0) {
    return (
      <div className="flex-1 flex items-start justify-center pt-8 px-4">
        <p className="text-sm text-[#555] text-center max-w-md leading-relaxed">
          {t("search.noVideos")}
        </p>
      </div>
    );
  }

  const allPageSelected =
    pageItems.length > 0 && pageItems.every((item) => isBulkSelected(item));
  const previewSelected = previewItem ? isBulkSelected(previewItem) : false;
  const locale = i18n.language?.startsWith("en") ? "en" : "es";
  const previewMeta = previewItem
    ? {
        channel: previewItem.channel || previewItem.uploader,
        views: formatCount(previewItem.view_count ?? previewItem.viewCount, locale),
        likes: formatCount(previewItem.like_count ?? previewItem.likeCount, locale),
        uploaded: formatUploadDate(previewItem.upload_date ?? previewItem.uploadDate, locale),
        videoId: extractYouTubeId(previewItem.url),
        isLive: /is_live|live_now/i.test(previewItem.live_status || previewItem.liveStatus || ""),
      }
    : null;

  function toggleSelectPage() {
    if (allPageSelected) {
      const keys = new Set(pageItems.map(videoKey));
      setBulkSelection((prev) => prev.filter((v) => !keys.has(videoKey(v))));
    } else {
      setBulkSelection((prev) => {
        const map = new Map(prev.map((v) => [videoKey(v), v]));
        pageItems.forEach((item) => map.set(videoKey(item), item));
        return [...map.values()];
      });
    }
  }

  async function configureBulk() {
    if (bulkSelection.length === 0) return;
    setConfiguring(true);
    try {
      const first = bulkSelection[0];
      let video = first;
      if (!first.formats?.length) {
        video = await invoke("get_url_details", {
          url: first.url,
          ...cookieInvokeArgs(),
        });
      }
      setSelectedVideo(video);
      navigate("/val");
    } catch (e) {
      console.error(e);
      alert(typeof e === "string" ? e : e?.message || t("search.failed"));
    } finally {
      setConfiguring(false);
    }
  }

  async function openResult(item) {
    try {
      setConfiguring(true);
      // Single-video open must not keep a prior multi-select as bulk download.
      clearBulkSelection();
      let video = item;
      if (!item.formats?.length) {
        video = await invoke("get_url_details", {
          url: item.url,
          ...cookieInvokeArgs(),
        });
      }
      setSelectedVideo(video);
      navigate("/val");
    } catch (e) {
      console.error(e);
      alert(typeof e === "string" ? e : e?.message || t("search.failed"));
    } finally {
      setConfiguring(false);
    }
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden flex-col">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-[2] flex flex-col min-h-0 overflow-hidden w-full">
          <div
            className={`${SEARCH_RESULT_GRID} py-2.5 text-xs border-b border-black shrink-0 bg-[#f4f4f4] font-medium`}
          >
            <label className="flex items-center justify-self-start cursor-pointer" title={t("search.selectPage")}>
              <input type="checkbox" checked={allPageSelected} onChange={toggleSelectPage} />
            </label>
            <span className="min-w-0 truncate text-left">{t("search.colTitle")}</span>
            <span className="min-w-0 truncate text-left">{t("search.colArtist")}</span>
            <span className="min-w-0 text-right tabular-nums">{t("search.colDuration")}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-white">
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              {pageItems.map((item, index) => {
                const active = index === curr;
                return (
                  <div
                    key={videoKey(item) || index}
                    style={{ height: SEARCH_ROW_HEIGHT_PX }}
                    className={`${SEARCH_RESULT_GRID} relative border-b border-black text-sm shrink-0 box-border ${
                      active ? "bg-black text-white" : "bg-white text-black hover:bg-black hover:text-white"
                    }`}
                    onMouseEnter={() => setCurr(index)}
                  >
                    <input
                      type="checkbox"
                      className="shrink-0 relative z-10 justify-self-start"
                      checked={isBulkSelected(item)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleBulkItem(item);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <p className="truncate min-w-0 text-left relative z-[1] pointer-events-none" title={item.title}>
                      {item.title}
                    </p>
                    <p className="truncate min-w-0 text-left relative z-[1] pointer-events-none" title={item.uploader}>
                      {item.uploader}
                    </p>
                    <p className="min-w-0 text-right tabular-nums relative z-[1] pointer-events-none">
                      {item.duration}
                    </p>
                    <button
                      type="button"
                      className="absolute inset-0 z-[2]"
                      aria-label={item.title}
                      onClick={() => openResult(item)}
                    />
                  </div>
                );
              })}
            </div>
            <div
              style={{ minHeight: SEARCH_PAGINATION_HEIGHT_PX }}
              className="flex items-center justify-between gap-2 px-2 border-t border-black text-xs shrink-0 bg-[#f4f4f4] py-1"
            >
              <button
                type="button"
                disabled={page <= 0}
                className="disabled:opacity-40 px-2"
                onClick={() => setSearchPage(Math.max(0, page - 1))}
              >
                {t("search.prev")}
              </button>
              <div className="flex flex-col items-center gap-0.5 min-w-0">
                <span>{t("search.page", { page: page + 1, total: totalPages })}</span>
                {canLoadMore || loadingMore ? (
                  <button
                    type="button"
                    disabled={loadingMore || !canLoadMore}
                    className="underline disabled:opacity-50 disabled:no-underline truncate max-w-full"
                    onClick={async () => {
                      try {
                        await loadMoreSearch();
                      } catch (e) {
                        alert(
                          typeof e === "string" ? e : e?.message || t("search.failed"),
                        );
                      }
                    }}
                  >
                    {loadingMore ? t("search.loadingMore") : t("search.loadMore")}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                className="disabled:opacity-40 px-2"
                onClick={() => setSearchPage(Math.min(totalPages - 1, page + 1))}
              >
                {t("search.next")}
              </button>
            </div>
          </div>
        </div>
        <div
          className={`w-72 shrink-0 flex min-h-0 flex-col overflow-hidden border-l border-black ${
            open ? "hidden" : ""
          }`}
        >
          {previewItem ? (
            <div className="flex flex-col flex-1 min-h-0 p-3 gap-3">
              <div className="w-full aspect-video overflow-hidden border border-black bg-[#eee] shrink-0">
                {previewItem.thumbnail ? (
                  <img
                    src={previewItem.thumbnail}
                    alt={t("search.thumbnail")}
                    className="h-full w-full object-cover object-center"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-xs text-[#555]">
                    {t("search.thumbnail")}
                  </div>
                )}
              </div>
              <div className="min-h-0 flex-1 flex flex-col gap-2 overflow-hidden text-black">
                <p className="text-[10px] uppercase tracking-wide text-[#555] shrink-0">
                  {t("search.previewInfo")}
                  {enrichingKey && enrichingKey === previewKey
                    ? ` · ${t("search.previewEnriching")}`
                    : ""}
                </p>
                <div className="space-y-1.5 overflow-y-auto min-h-0 pr-0.5">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[#555]">
                      {t("search.colTitle")}
                    </p>
                    <p className="text-sm font-medium leading-snug" title={previewItem.title}>
                      {previewItem.title}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[#555]">
                      {t("search.colArtist")}
                    </p>
                    <p className="text-xs truncate" title={previewMeta?.channel}>
                      {previewMeta?.channel || t("download.unknown")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[#555]">
                      {t("search.colDuration")}
                    </p>
                    <p className="text-xs tabular-nums">
                      {previewItem.duration || t("download.unknown")}
                      {previewMeta?.isLive ? ` · ${t("search.live")}` : ""}
                    </p>
                  </div>
                  {previewMeta?.views ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[#555]">
                        {t("search.views")}
                      </p>
                      <p className="text-xs tabular-nums">{previewMeta.views}</p>
                    </div>
                  ) : null}
                  {previewMeta?.likes ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[#555]">
                        {t("search.likes")}
                      </p>
                      <p className="text-xs tabular-nums">{previewMeta.likes}</p>
                    </div>
                  ) : null}
                  {previewMeta?.uploaded ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[#555]">
                        {t("search.uploadDate")}
                      </p>
                      <p className="text-xs">{previewMeta.uploaded}</p>
                    </div>
                  ) : null}
                  {previewMeta?.videoId ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[#555]">
                        {t("search.videoId")}
                      </p>
                      <p className="text-xs font-mono truncate" title={previewMeta.videoId}>
                        {previewMeta.videoId}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="mt-auto flex flex-col gap-2 pt-2 shrink-0 border-t border-black/15">
                  <p className="text-[10px] text-[#555] leading-snug">{t("search.previewNotFileMeta")}</p>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={previewSelected}
                      onChange={() => toggleBulkItem(previewItem)}
                    />
                    {t("search.addToSelection")}
                  </label>
                  <button
                    type="button"
                    disabled={configuring}
                    onClick={() => openResult(previewItem)}
                    className="w-full px-3 py-1.5 bg-black text-white text-sm hover:bg-[#dfdfdf] hover:text-black disabled:opacity-50"
                  >
                    {t("search.openResult")}
                  </button>
                  <p className="text-[10px] text-[#555] leading-snug">{t("search.previewHint")}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {bulkSelection.length > 0 ? (
        <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-t border-black bg-white">
          <span className="text-sm">{t("search.selected", { count: bulkSelection.length })}</span>
          <button
            type="button"
            disabled={configuring}
            onClick={configureBulk}
            className="px-3 py-1.5 bg-black text-white text-sm rounded-full hover:bg-[#dfdfdf] hover:text-black disabled:opacity-50"
          >
            {t("search.configureDownload")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
