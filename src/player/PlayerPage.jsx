import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import SearchBar from "../components/search/search_bar";
import { useVideo } from "../providers/video_context";
import { usePlayerSession } from "../providers/player_session_context";
import { formatNowPlayingDisplay } from "../lib/player_display";
import PlaylistPanel from "./PlaylistPanel";

export default function PlayerPage() {
  const { t } = useTranslation();
  const { searchResults, searchPage, setSearchPage } = useVideo();
  const {
    nowPlaying,
    mediaSrc,
    status,
    error,
    rateLimited,
    playlist,
    playlistsMeta,
    activePlaylistId,
    prefetchEnabled,
    preparingCount,
    savingIds,
    requestPlay,
    addToPlaylist,
    removeFromPlaylist,
    createPlaylist,
    selectPlaylist,
    renamePlaylist,
    deletePlaylist,
    clearActivePlaylist,
    setPrefetchEnabled,
    dismissRateLimit,
    playNext,
    playPrev,
    downloadAudio,
    downloadVideo,
  } = usePlayerSession();
  const [, setIsFocused] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlMsg, setDlMsg] = useState("");

  useEffect(() => {
    setSearchPage(0);
  }, [searchResults, setSearchPage]);

  async function onDownloadAudio() {
    setDlMsg("");
    setDlBusy(true);
    try {
      await downloadAudio(nowPlaying);
      setDlMsg(t("player.audioQueued"));
    } catch (e) {
      const code = typeof e === "string" ? e : e?.message;
      setDlMsg(
        code === "needFolder" ? t("download.needFolder") : code || t("player.audioFailed"),
      );
    } finally {
      setDlBusy(false);
    }
  }

  async function onDownloadVideo() {
    setDlMsg("");
    setDlBusy(true);
    try {
      await downloadVideo(nowPlaying);
      setDlMsg(t("player.videoQueued"));
    } catch (e) {
      const code = typeof e === "string" ? e : e?.message;
      setDlMsg(code || t("player.videoFailed"));
    } finally {
      setDlBusy(false);
    }
  }

  const displayError = error === "rateLimited" ? t("player.rateLimitedShort") : error;

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

  const nowPlayingLabel = nowPlaying
    ? formatNowPlayingDisplay(nowPlaying) || t("player.noTrack")
    : t("player.noTrack");

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden flex-col">
      {rateLimited ? (
        <div className="shrink-0 bg-[#111] text-white text-xs px-3 py-2 flex items-center gap-2 justify-between">
          <span>{t("player.rateLimitedBanner")}</span>
          <button
            type="button"
            className="underline shrink-0"
            onClick={dismissRateLimit}
          >
            {t("player.rateLimitedDismiss")}
          </button>
        </div>
      ) : null}
      <div className="shrink-0 flex justify-center py-3 px-4">
        <SearchBar setIsFocused={setIsFocused} playerMode />
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
            <div className="text-sm font-medium truncate" title={nowPlaying ? nowPlayingLabel : undefined}>
              {nowPlayingLabel}
            </div>
            {displayError ? (
              <p className="text-xs text-red-700 whitespace-pre-wrap">{displayError}</p>
            ) : null}
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                className="shrink-0 inline-flex items-center gap-1.5 border border-black px-2.5 py-1.5 text-sm leading-none hover:bg-black hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-inherit transition-colors"
                onClick={playPrev}
                disabled={!nowPlaying}
                aria-label={t("player.prev")}
                title={t("player.prev")}
              >
                <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
                <span className="hidden sm:inline">{t("player.prev")}</span>
              </button>

              <div className="flex-1 flex items-center justify-center gap-2 min-w-0 flex-wrap">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 bg-black text-white px-2.5 py-1.5 text-sm leading-none hover:bg-[#222] disabled:opacity-40 transition-colors"
                  onClick={onDownloadAudio}
                  disabled={!nowPlaying || dlBusy}
                >
                  {t("player.downloadAudio")}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 border border-black px-2.5 py-1.5 text-sm leading-none hover:bg-black hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-inherit transition-colors"
                  onClick={onDownloadVideo}
                  disabled={!nowPlaying || dlBusy}
                >
                  {t("player.downloadVideo")}
                </button>
                {dlMsg ? (
                  <span className="text-xs text-[#555] truncate max-w-[10rem]">{dlMsg}</span>
                ) : null}
              </div>

              <button
                type="button"
                className="shrink-0 inline-flex items-center gap-1.5 border border-black px-2.5 py-1.5 text-sm leading-none hover:bg-black hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-inherit transition-colors"
                onClick={playNext}
                disabled={!nowPlaying}
                aria-label={t("player.next")}
                title={t("player.next")}
              >
                <span className="hidden sm:inline">{t("player.next")}</span>
                <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <PlaylistPanel
          searchResults={searchResults}
          searchPage={searchPage}
          setSearchPage={setSearchPage}
          nowPlaying={nowPlaying}
          status={status}
          playlist={playlist}
          playlistsMeta={playlistsMeta}
          activePlaylistId={activePlaylistId}
          rateLimited={rateLimited}
          prefetchEnabled={prefetchEnabled}
          preparingCount={preparingCount}
          savingIds={savingIds}
          requestPlay={requestPlay}
          addToPlaylist={addToPlaylist}
          removeFromPlaylist={removeFromPlaylist}
          createPlaylist={createPlaylist}
          selectPlaylist={selectPlaylist}
          renamePlaylist={renamePlaylist}
          deletePlaylist={deletePlaylist}
          clearActivePlaylist={clearActivePlaylist}
          setPrefetchEnabled={setPrefetchEnabled}
        />
      </div>
    </div>
  );
}
