import { useState } from "react";
import { useTranslation } from "react-i18next";
import SearchBar from "../search/search_bar";
import { useVideo } from "../../providers/video_context";
import { usePlayerSession } from "../../providers/player_session_context";
import { formatNowPlayingDisplay } from "../../lib/player_display";
import { videoKey } from "../../lib/youtube_id";
import { SEARCH_LOADING_SENTINEL } from "../../lib/search_constants";

/** Mobile search + playback view (bottom-nav tab). */
export default function MobileSearch() {
  const { t } = useTranslation();
  const { searchResults } = useVideo();
  const {
    nowPlaying,
    mediaSrc,
    status,
    error,
    requestPlay,
    playNext,
    playPrev,
    downloadAudio,
  } = usePlayerSession();
  const [isFocused, setIsFocused] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlMsg, setDlMsg] = useState("");

  async function onDownloadAudio() {
    setDlMsg("");
    setDlBusy(true);
    try {
      await downloadAudio(nowPlaying);
      setDlMsg(t("player.audioQueued"));
    } catch (e) {
      const code = typeof e === "string" ? e : e?.message;
      setDlMsg(code === "needFolder" ? t("download.needFolder") : code || t("player.audioFailed"));
    } finally {
      setDlBusy(false);
    }
  }

  const isLoading =
    Array.isArray(searchResults) &&
    searchResults.length === 1 &&
    searchResults[0]?.title === SEARCH_LOADING_SENTINEL;
  const results = isLoading ? [] : searchResults || [];
  const hasResults = results.length > 0;

  const statusLabel =
    status === "waiting"
      ? t("player.statusWaiting")
      : status === "caching"
        ? t("player.statusCaching")
        : status === "error"
          ? t("player.statusError")
          : status === "playing"
            ? t("player.statusPlaying")
            : t("player.statusIdle");

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 px-3 pt-3 pb-2 flex justify-center">
        <SearchBar setIsFocused={setIsFocused} playerMode />
      </div>

      {nowPlaying ? (
        <div className="shrink-0 border-t border-black bg-[#111] text-white flex flex-col">
          <div className="flex items-center justify-center min-h-0">
            {mediaSrc ? (
              <video
                key={mediaSrc}
                className="max-w-full max-h-52"
                src={mediaSrc}
                controls
                autoPlay
                onEnded={playNext}
              />
            ) : (
              <p className="text-white/70 text-xs px-4 py-3 text-center">
                {status === "error" ? error || statusLabel : statusLabel}
              </p>
            )}
          </div>
          <div className="px-3 py-2 flex items-center gap-2 border-t border-white/10">
            <button
              type="button"
              className="min-h-11 px-4 border border-white/30 text-sm disabled:opacity-40"
              onClick={playPrev}
              disabled={!nowPlaying}
              aria-label={t("player.prev")}
            >
              ←
            </button>
            <div className="flex-1 min-w-0 text-center">
              <p className="text-sm font-medium truncate">
                {formatNowPlayingDisplay(nowPlaying) || nowPlaying.title}
              </p>
            </div>
            <button
              type="button"
              className="min-h-11 px-4 border border-white/30 text-sm disabled:opacity-40"
              onClick={playNext}
              disabled={!nowPlaying}
              aria-label={t("player.next")}
            >
              →
            </button>
          </div>
          <div className="px-3 pb-2 flex items-center gap-2 border-t border-white/10 pt-2">
            <button
              type="button"
              className="min-h-11 px-3 bg-white text-black text-xs disabled:opacity-40"
              onClick={onDownloadAudio}
              disabled={!nowPlaying || dlBusy}
            >
              {t("player.downloadAudio")}
            </button>
            {dlMsg ? (
              <span className="text-[10px] text-white/70 truncate">{dlMsg}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto border-t border-black">
        {isLoading ? (
          <p className="px-4 py-3 text-sm text-[#555]">{t("search.loading")}</p>
        ) : !hasResults ? (
          <p className="px-4 py-3 text-sm text-[#555]">
            {isFocused || searchResults ? t("search.noVideos") : t("search.noResultsYet")}
          </p>
        ) : (
          <ul>
            {results.map((item) => (
              <li key={videoKey(item) || item.url}>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 min-h-14 text-left border-b border-black/15 active:bg-black active:text-white"
                  onClick={() => void requestPlay(item)}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-[#777]">{item.uploader}</span>
                  </span>
                  {item.duration ? (
                    <span className="shrink-0 text-xs tabular-nums text-[#555]">
                      {item.duration}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
