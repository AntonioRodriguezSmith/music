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
  pageSizeForListHeight,
  shouldRecalcPageSize,
} from "../../lib/search_constants";
import { cookieInvokeArgs } from "../../lib/cookies_prefs";
import { friendlyError } from "../../lib/app_errors";
import { extractYouTubeId } from "../../lib/youtube_id";
import { formatCount, formatUploadDate } from "../../lib/preview_meta";
import ResultRow from "./ResultRow";
import PreviewPanel from "./PreviewPanel";

export default function SearchResults({ open }) {
  const { t } = useTranslation();
  // Active (highlighted/previewed) row is tracked by video key so it survives
  // page changes: going back to a page restores the same row as selected.
  const [activeKey, setActiveKey] = useState(null);
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
  const activeIndex = pageItems.findIndex((item) => videoKey(item) === activeKey);
  const curr = activeIndex >= 0 ? activeIndex : 0;
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

  if (!isTauri()) {
    return (
      <div className="flex-1 flex items-start justify-center px-4 pt-4">
        <div className="max-w-xl text-base leading-relaxed text-[#333] text-center">
          <p className="font-semibold mb-2">{t("search.browserHintTitle")}</p>
          <p>{t("search.browserHintBody")}</p>
        </div>
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
  const previewMeta = previewItem
    ? {
        channel: previewItem.channel || previewItem.uploader,
        views: formatCount(previewItem.view_count ?? previewItem.viewCount),
        likes: formatCount(previewItem.like_count ?? previewItem.likeCount),
        uploaded: formatUploadDate(previewItem.upload_date ?? previewItem.uploadDate),
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
      alert(friendlyError(e, t));
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
      alert(friendlyError(e, t));
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
              {pageItems.map((item, index) => (
                <ResultRow
                  key={videoKey(item) || index}
                  item={item}
                  index={index}
                  active={index === curr}
                  selected={isBulkSelected(item)}
                  onHover={(index) =>
                    setActiveKey(videoKey(pageItems[index]) ?? null)
                  }
                  onToggleSelect={toggleBulkItem}
                  onOpen={openResult}
                />
              ))}
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
                        alert(friendlyError(e, t));
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
        <PreviewPanel
          item={previewItem}
          meta={previewMeta}
          enriching={enrichingKey && enrichingKey === previewKey}
          selected={previewSelected}
          configuring={configuring}
          onToggleSelect={toggleBulkItem}
          onOpen={openResult}
          open={open}
        />
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
