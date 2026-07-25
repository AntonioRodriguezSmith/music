import { createContext, useState, useContext, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { videoKey } from "../lib/youtube_id";
import { cookieInvokeArgs } from "../lib/cookies_prefs";
import { isTauri } from "../lib/tauri_env";
import {
  SEARCH_FETCH_INITIAL,
  SEARCH_FETCH_MAX,
  SEARCH_LOADING_SENTINEL,
} from "../lib/search_constants";

const VideoContext = createContext();

function needsEnrichment(video) {
  if (!video) return false;
  const hasViews = video.view_count != null || video.viewCount != null;
  const hasLikes = video.like_count != null || video.likeCount != null;
  const hasFormats = Array.isArray(video.formats) && video.formats.length > 0;
  return !(hasViews && hasLikes && hasFormats);
}

function mergeSearchResults(prev, incoming) {
  const map = new Map();
  if (Array.isArray(prev)) {
    for (const item of prev) {
      const key = videoKey(item);
      if (key) map.set(key, item);
    }
  }
  for (const item of incoming) {
    const key = videoKey(item);
    if (!key || map.has(key)) continue;
    map.set(key, item);
  }
  return [...map.values()];
}

export function VideoProvider({ children }) {
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [searchResults, setSearchResultsRaw] = useState(null);
  const [bulkSelection, setBulkSelection] = useState([]);
  const [searchPage, setSearchPage] = useState(0);
  const [enrichingKey, setEnrichingKey] = useState(null);
  const [lastSearchQuery, setLastSearchQuery] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const searchIdRef = useRef(0);
  const detailsCacheRef = useRef(new Map());
  const enrichRequestRef = useRef(0);
  /** @type {React.MutableRefObject<"replace" | "expand">} */
  const searchModeRef = useRef("replace");

  const nextSearchId = useCallback(() => {
    searchIdRef.current += 1;
    return searchIdRef.current;
  }, []);

  const setSearchResultsAndResetPage = useCallback((value) => {
    setSearchResultsRaw(value);
    setSearchPage(0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten;

    listen("search-update", (event) => {
      if (cancelled) return;
      const payload = event.payload;
      let results = payload;
      let searchId = null;
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        searchId = payload.search_id ?? payload.searchId ?? null;
        results = payload.results;
      }
      if (searchId != null && searchId !== searchIdRef.current) {
        return;
      }
      if (!Array.isArray(results)) {
        setSearchResultsRaw(results);
        return;
      }
      const seen = new Set();
      const deduped = [];
      for (const item of results) {
        const key = videoKey(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const cached = detailsCacheRef.current.get(key);
        deduped.push(cached ? { ...item, ...cached, url: item.url || cached.url } : item);
      }
      if (searchModeRef.current === "expand") {
        setSearchResultsRaw((prev) => mergeSearchResults(prev, deduped));
      } else {
        setSearchResultsRaw(deduped);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const toggleBulkItem = useCallback((video) => {
    const key = videoKey(video);
    setBulkSelection((prev) => {
      const exists = prev.some((v) => videoKey(v) === key);
      if (exists) return prev.filter((v) => videoKey(v) !== key);
      return [...prev, video];
    });
  }, []);

  const clearBulkSelection = useCallback(() => {
    setBulkSelection([]);
  }, []);

  const isBulkSelected = useCallback(
    (video) => bulkSelection.some((v) => videoKey(v) === videoKey(video)),
    [bulkSelection],
  );

  const beginReplaceSearch = useCallback((query) => {
    searchModeRef.current = "replace";
    setLastSearchQuery(query);
    setSearchExpanded(false);
    setLoadingMore(false);
  }, []);

  const loadMoreSearch = useCallback(async () => {
    if (!isTauri() || !lastSearchQuery || searchExpanded || loadingMore) return;
    const beforeCount = Array.isArray(searchResults) ? searchResults.length : 0;
    if (beforeCount <= 0 || beforeCount >= SEARCH_FETCH_MAX) {
      setSearchExpanded(true);
      return;
    }

    searchModeRef.current = "expand";
    const searchId = nextSearchId();
    setLoadingMore(true);
    try {
      await invoke("get_top_search", {
        query: lastSearchQuery,
        search_id: searchId,
        limit: SEARCH_FETCH_MAX,
        ...cookieInvokeArgs(),
      });
      setSearchExpanded(true);
    } catch (e) {
      console.error(e);
      throw e;
    } finally {
      if (searchIdRef.current === searchId) {
        setLoadingMore(false);
      }
    }
  }, [lastSearchQuery, loadingMore, nextSearchId, searchExpanded, searchResults]);

  const enrichVideoDetails = useCallback(async (video) => {
    if (!isTauri() || !video?.url) return null;
    const key = videoKey(video);
    if (!key) return null;

    if (detailsCacheRef.current.has(key)) {
      return detailsCacheRef.current.get(key);
    }
    if (!needsEnrichment(video)) {
      detailsCacheRef.current.set(key, video);
      return video;
    }

    const requestId = ++enrichRequestRef.current;
    setEnrichingKey(key);
    try {
      const details = await invoke("get_url_details", {
        url: video.url,
        ...cookieInvokeArgs(),
      });
      if (requestId !== enrichRequestRef.current) return null;
      detailsCacheRef.current.set(key, details);
      setSearchResultsRaw((prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((item) =>
          videoKey(item) === key
            ? { ...item, ...details, url: item.url || details.url }
            : item,
        );
      });
      return details;
    } catch (e) {
      console.error(e);
      return null;
    } finally {
      if (requestId === enrichRequestRef.current) {
        setEnrichingKey(null);
      }
    }
  }, []);

  const isSearchLoading =
    Array.isArray(searchResults) &&
    searchResults.length === 1 &&
    searchResults[0]?.title === SEARCH_LOADING_SENTINEL;

  const canLoadMore =
    Boolean(lastSearchQuery) &&
    !searchExpanded &&
    !isSearchLoading &&
    Array.isArray(searchResults) &&
    searchResults.length >= SEARCH_FETCH_INITIAL &&
    searchResults.length < SEARCH_FETCH_MAX;

  return (
    <VideoContext.Provider
      value={{
        selectedVideo,
        setSelectedVideo,
        searchResults,
        setSearchResults: setSearchResultsAndResetPage,
        bulkSelection,
        setBulkSelection,
        toggleBulkItem,
        clearBulkSelection,
        isBulkSelected,
        searchPage,
        setSearchPage,
        nextSearchId,
        searchIdRef,
        enrichVideoDetails,
        enrichingKey,
        lastSearchQuery,
        beginReplaceSearch,
        loadMoreSearch,
        loadingMore,
        canLoadMore,
        searchExpanded,
      }}
    >
      {children}
    </VideoContext.Provider>
  );
}

export function useVideo() {
  return useContext(VideoContext);
}
