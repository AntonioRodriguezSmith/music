import { useState } from "react";
import { useTranslation } from "react-i18next";
import { videoKey } from "../lib/youtube_id";
import { formatNowPlayingDisplay } from "../lib/player_display";
import { SEARCH_LOADING_SENTINEL, SEARCH_PAGE_SIZE } from "../lib/search_constants";

export default function PlaylistPanel({
  searchResults,
  searchPage,
  setSearchPage,
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
}) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const activeLabel =
    playlistsMeta.find((p) => p.id === activePlaylistId)?.name || activePlaylistId;

  const isLoading =
    searchResults?.length === 1 && searchResults[0]?.title === SEARCH_LOADING_SENTINEL;
  const realResults = isLoading ? [] : searchResults || [];
  const totalPages = Math.max(1, Math.ceil(realResults.length / SEARCH_PAGE_SIZE));
  const page = Math.min(searchPage, totalPages - 1);
  const pageItems = realResults.slice(
    page * SEARCH_PAGE_SIZE,
    page * SEARCH_PAGE_SIZE + SEARCH_PAGE_SIZE,
  );

  async function submitCreatePlaylist(e) {
    e?.preventDefault?.();
    const name = newName.trim();
    if (!name) return;
    await createPlaylist(name);
    setNewName("");
    setCreating(false);
  }

  function onDeletePlaylist() {
    setMenuOpen(false);
    if (!activePlaylistId || activePlaylistId === "default") return;
    if (!window.confirm(t("player.deletePlaylistConfirm", { name: activeLabel }))) return;
    void deletePlaylist(activePlaylistId);
  }

  function onRenamePlaylist() {
    setMenuOpen(false);
    const name = window.prompt(t("player.playlistName"), activeLabel);
    if (!name?.trim() || name.trim() === activeLabel) return;
    void renamePlaylist(activePlaylistId, name.trim());
  }

  function onClearPlaylist() {
    setMenuOpen(false);
    if (!window.confirm(t("player.clearPlaylistConfirm", { name: activeLabel }))) return;
    void clearActivePlaylist(true);
  }

  function itemBadge(item, active) {
    if (item.offline) {
      return (
        <span
          className={`shrink-0 text-[9px] uppercase tracking-wide ${
            active ? "text-white/70" : "text-[#555]"
          }`}
        >
          {t("player.offlineReady")}
        </span>
      );
    }
    if (savingIds?.has?.(item.id)) {
      return (
        <span
          className={`shrink-0 text-[9px] uppercase tracking-wide ${
            active ? "text-white/70" : "text-[#555]"
          }`}
        >
          {t("player.saving")}
        </span>
      );
    }
    return (
      <span
        className={`shrink-0 text-[9px] uppercase tracking-wide ${
          active ? "text-white/50" : "text-[#999]"
        }`}
      >
        {t("player.pendingOffline")}
      </span>
    );
  }

  const sessionBusy =
    Boolean(nowPlaying) &&
    (status === "playing" || status === "caching" || status === "waiting");

  return (
    <div className="w-80 border-l border-black flex flex-col min-h-0 shrink-0">
      <div className="px-3 py-2 border-b border-black flex flex-col gap-1.5">
        <div className="text-[10px] uppercase tracking-wide text-[#555]">
          {t("player.savedPlaylists")}
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <select
            className="flex-1 min-w-0 text-sm bg-transparent border border-black/30 px-1 py-0.5"
            value={activePlaylistId}
            onChange={(e) => selectPlaylist(e.target.value)}
            aria-label={t("player.playlist")}
          >
            {playlistsMeta.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.count})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="shrink-0 size-7 border border-black text-sm leading-none hover:bg-black hover:text-white"
            onClick={() => {
              setCreating((v) => !v);
              setMenuOpen(false);
            }}
            title={t("player.newPlaylist")}
            aria-label={t("player.newPlaylist")}
          >
            +
          </button>
          <div className="relative shrink-0">
            <button
              type="button"
              className="size-7 border border-black text-xs leading-none hover:bg-black hover:text-white"
              onClick={() => setMenuOpen((v) => !v)}
              title={t("player.playlistMenu")}
              aria-label={t("player.playlistMenu")}
            >
              ⋯
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-black text-xs min-w-[9rem] shadow">
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 hover:bg-[#f3f3f3]"
                  onClick={onRenamePlaylist}
                >
                  {t("player.renamePlaylist")}
                </button>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 hover:bg-[#f3f3f3]"
                  onClick={onClearPlaylist}
                >
                  {t("player.clearPlaylist")}
                </button>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 hover:bg-[#f3f3f3] disabled:opacity-40"
                  disabled={activePlaylistId === "default"}
                  onClick={onDeletePlaylist}
                >
                  {t("player.deletePlaylist")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {creating ? (
          <form className="flex gap-1" onSubmit={submitCreatePlaylist}>
            <input
              autoFocus
              className="flex-1 min-w-0 border border-black px-1.5 py-0.5 text-xs"
              placeholder={t("player.playlistName")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="shrink-0 border border-black px-2 text-xs bg-black text-white">
              OK
            </button>
          </form>
        ) : null}
        <div className="flex items-center justify-between gap-2 text-[10px] text-[#555]">
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={prefetchEnabled}
              disabled={rateLimited}
              onChange={(e) => setPrefetchEnabled(e.target.checked)}
            />
            {t("player.prefetch")}
          </label>
          {preparingCount > 0 ? (
            <span>{t("player.preparing", { count: preparingCount })}</span>
          ) : null}
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto min-h-0">
        {playlist.length === 0 ? (
          <li className="px-3 py-2 text-xs text-[#555]">{t("player.playlistEmpty")}</li>
        ) : (
          playlist.map((item) => {
            const active = nowPlaying && videoKey(nowPlaying) === videoKey(item);
            const saving = savingIds?.has?.(item.id);
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
                  onClick={() => requestPlay(item, { force: true })}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate font-medium">
                      {formatNowPlayingDisplay(item) || item.title}
                    </span>
                    {itemBadge(item, active)}
                  </div>
                </button>
                <div className="flex flex-col gap-0.5 shrink-0 items-end">
                  {!item.offline && !saving ? (
                    <button
                      type="button"
                      className="text-[10px] underline"
                      onClick={() => void addToPlaylist(item)}
                    >
                      {t("player.retryOffline")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => removeFromPlaylist(item.id)}
                  >
                    {t("player.remove")}
                  </button>
                </div>
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
          <div className="h-full flex items-center justify-center px-4">
            <p className="player-search-hint text-xs text-[#555] text-center max-w-[14rem] leading-relaxed">
              {t("player.searchHint")}
            </p>
          </div>
        ) : (
          <ul>
            {pageItems.map((video) => (
              <li key={videoKey(video) || video.url} className="border-b border-black/10 px-2 py-1.5">
                <div className="flex items-start gap-2 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {formatNowPlayingDisplay(video) || video.title}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    className="text-[11px] underline"
                    onClick={() => requestPlay(video)}
                  >
                    {sessionBusy ? t("player.queue") : t("player.play")}
                  </button>
                  <button
                    type="button"
                    className="text-[11px] underline"
                    onClick={() => void addToPlaylist(video)}
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
  );
}
