import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useVideo } from "../../providers/video_context";
import { resolveInput } from "../../lib/resolve_input";
import { isMobile, isTauri } from "../../lib/tauri_env";
import { cookieInvokeArgs } from "../../lib/cookies_prefs";
import { SEARCH_FETCH_INITIAL, SEARCH_LOADING_SENTINEL } from "../../lib/search_constants";
import { friendlyError } from "../../lib/app_errors";
import SearchIcon from "../svg/search";
import StopIcon from "../svg/stop";
import SearchHistoryDropdown from "./SearchHistoryDropdown";
import { loadSearchHistory, pushSearchHistory } from "../../lib/search_history";

/**
 * @param {{ setIsFocused: (v: boolean) => void, isFocused: boolean, playerMode?: boolean }} props
 * playerMode: never navigate to /val; URL → single result in place.
 */
export default function SearchBar({ setIsFocused, playerMode = false }) {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Waiting for the first real results; drives the spinner in the submit button.
  // Unlike `busy`, it clears as soon as results stream in, not when the search ends.
  const [showSpinner, setShowSpinner] = useState(false);
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

  // Stop the spinner as soon as real results stream in (don't wait for the full batch).
  // `busy` stays true so the stop button remains available while the search is in flight.
  useEffect(() => {
    if (!showSpinner || !Array.isArray(searchResults) || searchResults.length === 0) return;
    const stillLoading =
      searchResults.length === 1 && searchResults[0]?.title === SEARCH_LOADING_SENTINEL;
    if (!stillLoading) setShowSpinner(false);
  }, [showSpinner, searchResults]);

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
    setShowSpinner(true);
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
      setError(friendlyError(e, t));
      setSearchResults(null);
      setSelectedVideo(null);
      if (!playerMode) navigate("/");
    } finally {
      if (stillCurrent()) {
        setBusy(false);
        setShowSpinner(false);
      }
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

  /** Cancel the in-flight search: invalidate it in the frontend and kill it in the backend. */
  function handleStopSearch() {
    nextSearchId();
    setBusy(false);
    setShowSpinner(false);
    setShowHistory(false);
    if (isTauri()) {
      void invoke("cancel_search").catch((e) => console.error(e));
    }
  }

  return (
    <div
      className="relative w-full"
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
        className={`flex items-stretch overflow-hidden rounded-xl border border-black bg-white focus-within:ring-1 focus-within:ring-black transition-shadow duration-200 max-w-full ${
          isMobile() ? "w-full" : "w-80"
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
          className="min-w-0 flex-1 text-black font-normal text-base bg-transparent border-0 outline-none focus:ring-0 px-4 h-11"
          placeholder={t("search.placeholder")}
        />
        <button
          className="shrink-0 h-11 w-11 flex items-center justify-center border-0 border-l border-black bg-black text-white hover:bg-[#222] active:bg-[#111] transition-colors duration-150"
          type="submit"
          disabled={busy}
          aria-label={busy ? t("search.busy") : t("search.button")}
          title={busy ? t("search.busy") : t("search.button")}
        >
          {showSpinner ? (
            <span className="block size-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <span className="block size-5 text-white">
              <SearchIcon />
            </span>
          )}
        </button>
        {busy ? (
          <button
            type="button"
            className="shrink-0 h-11 w-11 flex items-center justify-center border-0 border-l border-black bg-red-600 text-white hover:bg-red-700 active:bg-red-800 transition-colors duration-150"
            onClick={handleStopSearch}
            aria-label={t("search.stop")}
            title={t("search.stop")}
          >
            <span className="block size-4 text-white">
              <StopIcon />
            </span>
          </button>
        ) : null}
      </form>

      {historyVisible ? (
        <SearchHistoryDropdown
          history={history}
          onPick={handlePickHistory}
          onClear={handleClearHistory}
          onRemove={handleRemoveItem}
        />
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
