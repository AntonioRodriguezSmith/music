import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useVideo } from "../../providers/video_context";
import { resolveInput } from "../../lib/resolve_input";
import { isTauri } from "../../lib/tauri_env";
import { cookieInvokeArgs } from "../../lib/cookies_prefs";
import { SEARCH_FETCH_INITIAL, SEARCH_LOADING_SENTINEL } from "../../lib/search_constants";
import SearchIcon from "../svg/search";
import {
  clearSearchHistory,
  loadSearchHistory,
  pushSearchHistory,
  removeSearchHistoryItem,
} from "../../lib/search_history";

/**
 * @param {{ setIsFocused: (v: boolean) => void, isFocused: boolean, playerMode?: boolean }} props
 * playerMode: never navigate to /val; URL → single result in place.
 */
export default function SearchBar({ setIsFocused, isFocused, playerMode = false }) {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(() => loadSearchHistory());
  const [showHistory, setShowHistory] = useState(false);
  const navigate = useNavigate();
  const {
    setSelectedVideo,
    setSearchResults,
    searchResults,
    clearBulkSelection,
    nextSearchId,
    searchIdRef,
    beginReplaceSearch,
  } = useVideo();

  // Stop spinner as soon as real results stream in (don't wait for the full batch).
  useEffect(() => {
    if (!busy || !Array.isArray(searchResults) || searchResults.length === 0) return;
    const stillLoading =
      searchResults.length === 1 && searchResults[0]?.title === SEARCH_LOADING_SENTINEL;
    if (!stillLoading) setBusy(false);
  }, [busy, searchResults]);

  async function runSearch(rawValue) {
    setError(null);
    if (!isTauri()) {
      setError(t("search.browserOnly"));
      return;
    }

    const value = String(rawValue ?? "").trim();
    if (!value) return;

    setSearchValue(value);
    const resolved = resolveInput(value);
    if (!resolved) return;

    // Bump id first so in-flight searches stop applying results / errors.
    const searchId = nextSearchId();
    setBusy(true);
    setShowHistory(false);

    const stillCurrent = () => searchIdRef.current === searchId;

    try {
      if (resolved.type === "url") {
        const cookies = cookieInvokeArgs();
        if (playerMode) {
          clearBulkSelection();
          beginReplaceSearch(resolved.url);
          setSearchResults([{ title: SEARCH_LOADING_SENTINEL, uploader: "", duration: "" }]);
          const videoDetails = await invoke("get_url_details", {
            url: resolved.url,
            ...cookies,
          });
          if (!stillCurrent()) return;
          setSearchResults([
            {
              ...videoDetails,
              url: videoDetails?.url || resolved.url,
              title: videoDetails?.title || resolved.url,
            },
          ]);
          setHistory(pushSearchHistory(value));
          return;
        }

        setSelectedVideo(null);
        setSearchResults(null);
        clearBulkSelection();
        navigate("/val");
        const videoDetails = await invoke("get_url_details", {
          url: resolved.url,
          ...cookies,
        });
        if (!stillCurrent()) return;
        setSelectedVideo(videoDetails);
        setHistory(pushSearchHistory(value));
        return;
      }

      clearBulkSelection();
      beginReplaceSearch(resolved.query);
      setSearchResults([{ title: SEARCH_LOADING_SENTINEL, uploader: "", duration: "" }]);
      await invoke("get_top_search", {
        query: resolved.query,
        search_id: searchId,
        limit: SEARCH_FETCH_INITIAL,
        ...cookieInvokeArgs(),
      });
      if (!stillCurrent()) return;
      setHistory(pushSearchHistory(value));
    } catch (e) {
      if (!stillCurrent()) return;
      console.error(e);
      const message =
        typeof e === "string" ? e : e?.message || JSON.stringify(e) || t("search.failed");
      setError(message);
      setSearchResults(null);
      setSelectedVideo(null);
      if (!playerMode) navigate("/");
    } finally {
      if (stillCurrent()) setBusy(false);
    }
  }

  function openHistory() {
    setHistory(loadSearchHistory());
    setShowHistory(true);
  }

  /** Fill the field only — search runs on Enter / button. */
  function handlePickHistory(query) {
    setSearchValue(query);
    setShowHistory(false);
    setError(null);
  }

  function handleClearHistory() {
    setHistory(clearSearchHistory());
    setShowHistory(false);
  }

  function handleClearResults() {
    setSearchResults(null);
    setSelectedVideo(null);
    setSearchValue("");
    setError(null);
    clearBulkSelection();
    setShowHistory(true);
    setHistory(loadSearchHistory());
  }

  function handleRemoveItem(query, e) {
    e.preventDefault();
    e.stopPropagation();
    setHistory(removeSearchHistoryItem(query));
  }

  const historyVisible =
    showHistory && history.length > 0 && !busy && !String(searchValue).trim();

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(e) {
    e.preventDefault();
    const text =
      e.dataTransfer.getData("text/uri-list") ||
      e.dataTransfer.getData("text/plain") ||
      "";
    const first = String(text).split(/\r?\n/).find((line) => line && !line.startsWith("#"));
    if (first) {
      setSearchValue(first.trim());
      setShowHistory(false);
      setError(null);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    void runSearch(searchValue);
  }

  return (
    <div
      className="relative"
      onFocus={() => setIsFocused(true)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsFocused(false);
          setShowHistory(false);
        }
      }}
    >
      <form
        className={`flex items-stretch overflow-hidden rounded-xl border border-black bg-white focus-within:ring-1 focus-within:ring-black transition-[width,box-shadow] duration-200 max-w-full ${
          isFocused ? "w-96" : "w-80"
        }`}
        onSubmit={handleSubmit}
      >
        <input
          id="search"
          value={searchValue}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowHistory(false);
          }}
          onChange={(e) => {
            const next = e.target.value;
            setSearchValue(next);
            if (!String(next).trim()) openHistory();
            else setShowHistory(false);
          }}
          onFocus={openHistory}
          type="text"
          autoComplete="off"
          name="q"
          enterKeyHint="search"
          className="min-w-0 flex-1 text-black font-light text-sm bg-transparent border-0 outline-none focus:ring-0 px-4 h-11"
          placeholder={t("search.placeholder")}
        />
        <button
          className="shrink-0 h-11 w-11 flex items-center justify-center border-0 border-l border-black bg-black text-white hover:bg-[#222] active:bg-[#111] transition-colors duration-150"
          type="submit"
          disabled={busy}
          aria-label={busy ? t("search.busy") : t("search.button")}
          title={busy ? t("search.busy") : t("search.button")}
        >
          {busy ? (
            <span className="block size-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <span className="block size-5 text-white">
              <SearchIcon />
            </span>
          )}
        </button>
      </form>

      {historyVisible ? (
        <div
          className="absolute left-0 right-11 z-30 mt-2 max-h-56 overflow-y-auto rounded-xl border border-black bg-white shadow-md"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[#e5e5e5] px-3 py-2 text-xs">
            <span className="font-medium">{t("search.historyTitle")}</span>
            <button
              type="button"
              className="underline hover:no-underline"
              onClick={handleClearHistory}
            >
              {t("search.historyClear")}
            </button>
          </div>
          <ul className="text-sm">
            {history.map((item) => (
              <li key={item} className="flex items-stretch border-b border-gray-100 last:border-b-0">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate px-3 py-2 text-left hover:bg-black hover:text-white"
                  onClick={() => handlePickHistory(item)}
                  title={item}
                >
                  {item}
                </button>
                <button
                  type="button"
                  className="shrink-0 px-3 text-xs hover:bg-black hover:text-white"
                  onClick={(e) => handleRemoveItem(item, e)}
                  aria-label={t("search.historyRemove")}
                  title={t("search.historyRemove")}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p className="text-red-600 text-sm mt-2 max-w-xl whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
          {error}
        </p>
      ) : null}

      {Array.isArray(searchResults) && searchResults.length > 0 && !busy ? (
        <button
          type="button"
          className="mt-2 text-xs underline hover:no-underline"
          onClick={handleClearResults}
        >
          {t("search.clearResults")}
        </button>
      ) : null}
    </div>
  );
}
