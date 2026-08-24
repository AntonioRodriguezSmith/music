import FolderPicker from "../download/save_destination";
import PlayerFolderPanel from "./player_folder_panel";
import CookiesSettings from "../download/cookies_settings";
import { useState, useEffect, useMemo, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import Queue from "../svg/queue";
import Folder from "../svg/folder";
import { isActive, isFinished } from "../../lib/download_status";
import { QUEUE_PAGE_SIZE, HISTORY_PAGE_SIZE } from "../../lib/search_constants";
import { useDownloadQueue } from "../../providers/download_queue_context";
import { DownloadPathContext } from "../../providers/download_path_context";
import { usePlayerSession } from "../../providers/player_session_context";
import {
  clearDownloadHistory,
  exportDownloadHistoryText,
  parentDirOf,
  removeDownloadHistoryItem,
} from "../../lib/download_history";
import { isTauri } from "../../lib/tauri_env";
import UpdateChecker from "./update_checker";
import SessionQueueList from "./sidebar/SessionQueueList";
import QueueList from "./sidebar/QueueList";
import HistoryList from "./sidebar/HistoryList";
import SidebarCollapsed from "./sidebar/SidebarCollapsed";

export default function SideBar({ open, setOpen, compact = false }) {
  const { t } = useTranslation();
  const {
    downloads,
    history,
    setHistory,
    toast,
    clearToast,
    resumeItems,
    resumeError,
    resumePending,
    dismissResume,
    getDownloadPurpose,
  } = useDownloadQueue();
  const {
    sessionQueue,
    nowPlaying,
    status: playerStatus,
    requestPlay,
    removeFromSessionQueue,
    clearSessionQueue,
    addToPlaylist,
  } = usePlayerSession();
  const { downloadPath } = useContext(DownloadPathContext);
  const [queuePage, setQueuePage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [tab, setTab] = useState("queue");
  const [resuming, setResuming] = useState(false);
  const [playerKeepPath, setPlayerKeepPath] = useState("");
  const navigate = useNavigate();
  const homePath = compact ? "/player" : "/";

  // Reset local UI when switching Download ↔ Player.
  useEffect(() => {
    setTab("queue");
    setQueuePage(0);
    setHistoryPage(0);
  }, [compact]);

  useEffect(() => {
    if (!compact || !isTauri()) {
      setPlayerKeepPath("");
      return undefined;
    }
    let cancelled = false;
    invoke("player_keep_dir")
      .then((dir) => {
        if (!cancelled) setPlayerKeepPath(String(dir || ""));
      })
      .catch(() => {
        if (!cancelled) setPlayerKeepPath("");
      });
    return () => {
      cancelled = true;
    };
  }, [compact]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => clearToast(), 4000);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  async function openPrimaryFolder() {
    if (!isTauri()) return;
    const path = String(compact ? playerKeepPath : downloadPath || "").trim();
    if (!path) {
      alert(compact ? t("sidebar.openFolderFailed") : t("download.needFolder"));
      return;
    }
    try {
      await openPath(path);
    } catch (e) {
      console.error(e);
      const message =
        typeof e === "string" ? e : e?.message || t("sidebar.openFolderFailed");
      alert(message);
    }
  }

  // Hide ephemeral player cache jobs — they are not user downloads.
  const entries = useMemo(
    () =>
      Object.entries(downloads).filter(
        ([id]) => {
          const purpose = getDownloadPurpose(id);
          return purpose !== "cache" && purpose !== "playlist";
        },
      ),
    [downloads, getDownloadPurpose],
  );
  const totalPages = Math.max(1, Math.ceil(entries.length / QUEUE_PAGE_SIZE));
  const page = Math.min(queuePage, totalPages - 1);
  const pageEntries = entries.slice(page * QUEUE_PAGE_SIZE, page * QUEUE_PAGE_SIZE + QUEUE_PAGE_SIZE);
  const activeCollapsed = useMemo(
    () => entries.filter(([, d]) => isActive(d.status)).slice(0, 2),
    [entries],
  );
  const hasFinished = entries.some(([, d]) => isFinished(d.status) || d.status === "cancelled" || d.status?.startsWith("error"));
  const hasCancellable = entries.some(([, d]) => isActive(d.status));

  const historyTotalPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const histPage = Math.min(historyPage, historyTotalPages - 1);
  const pageHistory = history.slice(
    histPage * HISTORY_PAGE_SIZE,
    histPage * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE,
  );

  useEffect(() => {
    if (queuePage > totalPages - 1) setQueuePage(Math.max(0, totalPages - 1));
  }, [queuePage, totalPages]);

  useEffect(() => {
    if (historyPage > historyTotalPages - 1) setHistoryPage(Math.max(0, historyTotalPages - 1));
  }, [historyPage, historyTotalPages]);

  async function openHistoryFile(filename) {
    if (!isTauri()) return;
    const path = String(filename || "").trim();
    if (!path) {
      alert(t("sidebar.openFileFailed"));
      return;
    }
    try {
      await openPath(path);
    } catch (e) {
      console.error(e);
      const message =
        typeof e === "string" ? e : e?.message || t("sidebar.openFileFailed");
      alert(message);
    }
  }

  async function openHistoryFolder(filename) {
    if (!isTauri()) return;
    const dir = parentDirOf(filename);
    if (!dir) {
      alert(t("sidebar.openFolderFailed"));
      return;
    }
    try {
      await openPath(dir);
    } catch (e) {
      console.error(e);
      const message =
        typeof e === "string" ? e : e?.message || t("sidebar.openFolderFailed");
      alert(message);
    }
  }

  async function cancelAllActive() {
    if (!isTauri()) return;
    const ids = entries.filter(([, d]) => isActive(d.status)).map(([id]) => id);
    await Promise.allSettled(
      ids.map((id) => invoke("stop_download", { id: parseInt(id, 10) })),
    );
  }

  async function handleResume() {
    setResuming(true);
    try {
      await resumePending();
    } finally {
      setResuming(false);
    }
  }

  function exportHistory() {
    const text = exportDownloadHistoryText(history);
    const blob = new Blob([text || ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clip-harbour-history.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function openQueueFromCollapsed() {
    setOpen(true);
    setTab("queue");
  }

  return (
    <div className="relative flex shrink-0 h-full min-h-0">
      <div
        className={`bg-white text-black border-r border-black transition-all duration-300 ease-in-out overflow-hidden flex flex-col h-full ${
          open ? (compact ? "w-64" : "w-72") : "w-12"
        }`}
      >
        <div className={`flex items-center shrink-0 ${open ? "justify-between px-3" : "justify-center flex-col gap-1"} py-2`}>
          <Link to={homePath} className={`font-bold ${open ? "text-3xl" : "text-lg"}`}>
            CH
          </Link>
        </div>

        <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${open ? "px-3 pb-3" : "p-1 items-center"}`}>
          {open ? (
            <div className="flex gap-1 shrink-0 mb-1">
              <button
                type="button"
                className={`flex-1 text-sm border border-black py-0.5 ${tab === "queue" ? "bg-black text-white" : ""}`}
                onClick={() => setTab("queue")}
              >
                {compact ? t("sidebar.tabSession") : t("sidebar.tabQueue")}
              </button>
              <button
                type="button"
                className={`flex-1 text-sm border border-black py-0.5 ${tab === "history" ? "bg-black text-white" : ""}`}
                onClick={() => setTab("history")}
              >
                {t("sidebar.tabHistory")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="size-8 my-2 shrink-0 relative"
              onClick={openQueueFromCollapsed}
              title={compact ? t("sidebar.tabSession") : t("sidebar.tabQueue")}
            >
              <Queue />
              {compact && sessionQueue.length > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-0.5 rounded-full bg-black text-white text-[9px] leading-3.5 text-center">
                  {sessionQueue.length > 9 ? "9+" : sessionQueue.length}
                </span>
              ) : null}
            </button>
          )}

          {open && tab === "queue" && compact ? (
            <SessionQueueList
              sessionQueue={sessionQueue}
              nowPlaying={nowPlaying}
              playerStatus={playerStatus}
              onPlay={(item) => void requestPlay(item, { force: true })}
              onRemove={removeFromSessionQueue}
              onClearSession={clearSessionQueue}
              onSaveNowPlaying={(video) => void addToPlaylist(video)}
            />
          ) : null}

          {open && tab === "queue" && !compact ? (
            <QueueList
              resumeItems={resumeItems}
              resumeError={resumeError}
              resuming={resuming}
              onResume={handleResume}
              onDismissResume={dismissResume}
              pageEntries={pageEntries}
              page={page}
              totalPages={totalPages}
              onPrevPage={() => setQueuePage((p) => Math.max(0, p - 1))}
              onNextPage={() => setQueuePage((p) => Math.min(totalPages - 1, p + 1))}
              hasCancellable={hasCancellable}
              onCancelAll={cancelAllActive}
              hasFinished={hasFinished}
              onClearFinished={() => invoke("clear_finished_downloads")}
            />
          ) : null}

          {open && tab === "history" ? (
            <HistoryList
              pageHistory={pageHistory}
              historyTotalPages={historyTotalPages}
              histPage={histPage}
              onPrevPage={() => setHistoryPage((p) => Math.max(0, p - 1))}
              onNextPage={() => setHistoryPage((p) => Math.min(historyTotalPages - 1, p + 1))}
              onOpenFile={openHistoryFile}
              onOpenFolder={openHistoryFolder}
              onRemove={(id) => setHistory(removeDownloadHistoryItem(id))}
              onExport={exportHistory}
              onClear={() => {
                setHistory(clearDownloadHistory());
                setHistoryPage(0);
              }}
              onFocusSearch={() => {
                navigate(homePath);
                if (!compact) {
                  requestAnimationFrame(() => {
                    setTimeout(() => document.getElementById("search")?.focus(), 50);
                  });
                }
              }}
              focusLabel={compact ? t("sidebar.focusPlayer") : t("search.historyTitle")}
            />
          ) : null}

          {!open ? (
            <SidebarCollapsed
              compact={compact}
              sessionQueue={sessionQueue}
              nowPlaying={nowPlaying}
              activeCollapsed={activeCollapsed}
              onPlay={(item) => {
                openQueueFromCollapsed();
                void requestPlay(item, { force: true });
              }}
            />
          ) : null}

          <div
            className={`shrink-0 mt-2 ${
              open ? "flex flex-col gap-2" : "flex justify-center"
            }`}
          >
            {open ? (
              <>
                {compact ? (
                  <>
                    <PlayerFolderPanel />
                    <FolderPicker
                      titleKey="sidebar.setAudioFolder"
                      dialogTitleKey="folder.audioDialogTitle"
                    />
                  </>
                ) : (
                  <FolderPicker />
                )}
                <CookiesSettings />
                {!compact ? <UpdateChecker /> : null}
              </>
            ) : (
              <button
                type="button"
                className="size-8 p-1 hover:opacity-70"
                onClick={openPrimaryFolder}
                title={
                  compact ? t("sidebar.setPlayerFolder") : t("sidebar.openFolder")
                }
                aria-label={
                  compact ? t("sidebar.setPlayerFolder") : t("sidebar.openFolder")
                }
              >
                <Folder />
              </button>
            )}
          </div>
        </div>
      </div>

      {toast === "batchDone" ? (
        <div className="absolute bottom-3 left-3 right-3 z-30 bg-black text-white text-xs px-2 py-1.5 rounded shadow">
          {t("sidebar.batchDone")}
        </div>
      ) : null}

      <button
        type="button"
        aria-label={open ? t("sidebar.collapse") : t("sidebar.expand")}
        onClick={() => setOpen(!open)}
        className="absolute top-1/2 -translate-y-1/2 -right-3 z-20 flex h-14 w-3 items-center justify-center rounded-r-md bg-black text-white hover:w-4 transition-all duration-200 shadow-md"
        title={open ? t("sidebar.collapse") : t("sidebar.expand")}
      >
        <span className="text-[10px] leading-none select-none">{open ? "‹" : "›"}</span>
      </button>
    </div>
  );
}
