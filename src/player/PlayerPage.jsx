import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import SearchBar from "../components/search/search_bar";
import { useVideo } from "../providers/video_context";
import { usePlayerSession } from "../providers/player_session_context";
import { videoKey } from "../lib/youtube_id";
import {
  SEARCH_LOADING_SENTINEL,
  SEARCH_PAGE_SIZE,
} from "../lib/search_constants";

export default function PlayerPage() {
  const { t } = useTranslation();
  const { searchResults, searchPage, setSearchPage } = useVideo();
  const {
    nowPlaying,
    mediaSrc,
    status,
    error,
    playlist,
    requestPlay,
    addToPlaylist,
    removeFromPlaylist,
    playNext,
    playPrev,
    downloadAudio,
  } = usePlayerSession();
  const [isFocused, setIsFocused] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioMsg, setAudioMsg] = useState("");

  const isLoading =
    searchResults?.length === 1 && searchResults[0]?.title === SEARCH_LOADING_SENTINEL;
  const realResults = isLoading ? [] : searchResults || [];
  const totalPages = Math.max(1, Math.ceil(realResults.length / SEARCH_PAGE_SIZE));
  const page = Math.min(searchPage, totalPages - 1);
  const pageItems = realResults.slice(page * SEARCH_PAGE_SIZE, page * SEARCH_PAGE_SIZE + SEARCH_PAGE_SIZE);

  useEffect(() => {
    setSearchPage(0);
  }, [searchResults, setSearchPage]);

  async function onDownloadAudio() {
    setAudioMsg("");
    setAudioBusy(true);
    try {
      await downloadAudio(nowPlaying);
      setAudioMsg(t("player.audioQueued"));
    } catch (e) {
      const code = typeof e === "string" ? e : e?.message;
      setAudioMsg(
        code === "needFolder" ? t("download.needFolder") : code || t("player.audioFailed"),
      );
    } finally {
      setAudioBusy(false);
    }
  }

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
    <div className="flex flex-1 min-h-0 overflow-hidden flex-col">
      <div className="shrink-0 flex justify-center py-3 px-4">
        <SearchBar setIsFocused={setIsFocused} isFocused={isFocused} />
      </div>
      <div className="h-px bg-black w-full shrink-0" />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
          <div className="flex-1 min-h-0 bg-[#111] flex items-center justify-center overflow-hidden">
            {mediaSrc ? (
              <video
                key={mediaSrc}
                className="max-w-full max-h-full"
                src={mediaSrc}
                controls
                autoPlay
                onEnded={playNext}
              />
            ) : (
              <p className="text-white/70 text-sm px-4 text-center">{statusLabel}</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col gap-2">
            <div className="text-sm font-medium truncate">
              {nowPlaying?.title || t("player.noTrack")}
            </div>
            {error ? <p className="text-xs text-red-700 whitespace-pre-wrap">{error}</p> : null}
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                className="border border-black px-3 py-1 text-sm"
                onClick={playPrev}
                disabled={!nowPlaying}
              >
                {t("player.prev")}
              </button>
              <button
                type="button"
                className="border border-black px-3 py-1 text-sm"
                onClick={playNext}
                disabled={!nowPlaying}
              >
                {t("player.next")}
              </button>
              <button
                type="button"
                className="bg-black text-white px-3 py-1 text-sm disabled:opacity-50"
                onClick={onDownloadAudio}
                disabled={!nowPlaying || audioBusy}
              >
                {t("player.downloadAudio")}
              </button>
              {audioMsg ? <span className="text-xs text-[#555]">{audioMsg}</span> : null}
            </div>
          </div>
        </div>

        <div className="w-80 border-l border-black flex flex-col min-h-0 shrink-0">
          <div className="px-3 py-2 border-b border-black text-sm font-medium">
            {t("player.playlist")}
          </div>
          <ul className="flex-1 overflow-y-auto min-h-0">
            {playlist.length === 0 ? (
              <li className="px-3 py-2 text-xs text-[#555]">{t("player.playlistEmpty")}</li>
            ) : (
              playlist.map((item) => {
                const active = nowPlaying && videoKey(nowPlaying) === videoKey(item);
                return (
                  <li
                    key={item.id}
                    className={`px-3 py-2 border-b border-black/20 text-sm flex gap-2 items-start ${
                      active ? "bg-black text-white" : "hover:bg-[#f3f3f3]"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex-1 text-left min-w-0"
                      onClick={() => requestPlay(item)}
                    >
                      <div className="truncate font-medium">{item.title}</div>
                      <div className={`text-xs truncate ${active ? "text-white/70" : "text-[#555]"}`}>
                        {item.uploader}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="text-xs shrink-0 underline"
                      onClick={() => removeFromPlaylist(item.id)}
                    >
                      {t("player.remove")}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="px-3 py-2 border-t border-black text-sm font-medium">
            {t("player.searchResults")}
          </div>
          <div className="h-48 overflow-y-auto border-t border-black/20">
            {isLoading ? (
              <p className="px-3 py-2 text-xs text-[#555]">{t("search.loading")}</p>
            ) : pageItems.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#555]">{t("player.searchHint")}</p>
            ) : (
              <ul>
                {pageItems.map((video) => (
                  <li key={videoKey(video) || video.url} className="border-b border-black/10 px-2 py-1.5">
                    <div className="text-xs font-medium truncate">{video.title}</div>
                    <div className="flex gap-2 mt-1">
                      <button
                        type="button"
                        className="text-[11px] underline"
                        onClick={() => requestPlay(video)}
                      >
                        {t("player.play")}
                      </button>
                      <button
                        type="button"
                        className="text-[11px] underline"
                        onClick={() => addToPlaylist(video)}
                      >
                        {t("player.add")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {realResults.length > SEARCH_PAGE_SIZE ? (
            <div className="flex gap-2 px-2 py-1 border-t border-black text-xs">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => setSearchPage(page - 1)}
                className="underline disabled:opacity-40"
              >
                {t("search.prev")}
              </button>
              <span>
                {page + 1}/{totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setSearchPage(page + 1)}
                className="underline disabled:opacity-40"
              >
                {t("search.next")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
