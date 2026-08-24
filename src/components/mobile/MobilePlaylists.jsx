import { useTranslation } from "react-i18next";
import { useVideo } from "../../providers/video_context";
import { usePlayerSession } from "../../providers/player_session_context";
import PlaylistPanel from "../../player/PlaylistPanel";

/** Mobile playlists view (bottom-nav tab). Reuses the desktop panel, full-width. */
export default function MobilePlaylists() {
  const { t } = useTranslation();
  const { searchResults, searchPage, setSearchPage } = useVideo();
  const {
    nowPlaying,
    status,
    playlist,
    playlistsMeta,
    activePlaylistId,
    rateLimited,
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
  } = usePlayerSession();

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <h1 className="shrink-0 px-4 py-3 text-sm font-medium border-b border-black">
        {t("player.savedPlaylists")}
      </h1>
      <div className="flex-1 min-h-0 overflow-hidden">
        <PlaylistPanel
          fullWidth
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
