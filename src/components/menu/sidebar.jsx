import FolderPicker from "../download/save_destination";
import CookiesSettings from "../download/cookies_settings";
import { useState, useEffect, useMemo, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import Loader from "./loader";
import Queue from "../svg/queue";
import Folder from "../svg/folder";
import CircularProgressBar from "../ui/circle_progress";
import { isActive, isFinished } from "../../lib/download_status";
import { setAppLanguage } from "../../i18n";
import i18n from "../../i18n";
import { QUEUE_PAGE_SIZE, HISTORY_PAGE_SIZE } from "../../lib/search_constants";
import { useDownloadQueue } from "../../providers/download_queue_context";
import { DownloadPathContext } from "../../providers/download_path_context";
import {
  clearDownloadHistory,
  exportDownloadHistoryText,
  parentDirOf,
  removeDownloadHistoryItem,
} from "../../lib/download_history";
import { isTauri } from "../../lib/tauri_env";
import UpdateChecker from "./update_checker";

export default function SideBar({ open, setOpen, compact = false }) {
  void compact;
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
  } = useDownloadQueue();
  const { downloadPath } = useContext(DownloadPathContext);
  const [queuePage, setQueuePage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [tab, setTab] = useState("queue");
  const [resuming, setResuming] = useState(false);
  const lang = i18n.language?.startsWith("en") ? "en" : "es";
  const navigate = useNavigate();

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => clearToast(), 4000);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  async function openDownloadFolder() {
    if (!isTauri()) return;
    const path = String(downloadPath || "").trim();
    if (!path) {
      alert(t("download.needFolder"));
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

  const entries = useMemo(() => Object.entries(downloads), [downloads]);
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

  return (
    <div className="relative flex shrink-0 h-full min-h-0">
      <div
        className={`bg-white text-black border-r border-black transition-all duration-300 ease-in-out overflow-hidden flex flex-col h-full ${
          open ? "w-72" : "w-12"
        }`}
      >
        <div className={`flex items-center shrink-0 ${open ? "justify-between px-3" : "justify-center flex-col gap-1"} py-2`}>
          <Link to="/" className={`font-bold ${open ? "text-3xl" : "text-lg"}`}>
            CH
          </Link>
          {open ? (
            <div className="flex text-xs gap-1">
              <button
                type="button"
                className={`px-1.5 py-0.5 border border-black rounded ${lang === "es" ? "bg-black text-white" : ""}`}
                onClick={() => setAppLanguage("es")}
              >
                {t("sidebar.langEs")}
              </button>
              <button
                type="button"
                className={`px-1.5 py-0.5 border border-black rounded ${lang === "en" ? "bg-black text-white" : ""}`}
                onClick={() => setAppLanguage("en")}
              >
                {t("sidebar.langEn")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-[10px] font-bold"
              onClick={() => setAppLanguage(lang === "es" ? "en" : "es")}
              title={lang === "es" ? "EN" : "ES"}
            >
              {lang === "es" ? t("sidebar.langEs") : t("sidebar.langEn")}
            </button>
          )}
        </div>

        <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${open ? "px-3 pb-3" : "p-1 items-center"}`}>
          {open ? (
            <div className="flex gap-1 shrink-0 mb-1">
              <button
                type="button"
                className={`flex-1 text-sm border border-black py-0.5 ${tab === "queue" ? "bg-black text-white" : ""}`}
                onClick={() => setTab("queue")}
              >
                {t("sidebar.tabQueue")}
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
              className="size-8 my-2 shrink-0"
              onClick={() => {
                setOpen(true);
                setTab("queue");
              }}
              title={t("sidebar.tabQueue")}
            >
              <Queue />
            </button>
          )}

          {open && tab === "queue" ? (
            <>
              {resumeItems.length > 0 ? (
                <div className="shrink-0 mb-2 border border-black p-2 text-xs space-y-1 bg-[#f4f4f4]">
                  <p>{t("sidebar.resumePending", { count: resumeItems.length })}</p>
                  {resumeError ? (
                    <p className="text-red-700 whitespace-pre-wrap break-words" role="alert">
                      {t("sidebar.resumeFailed")}: {resumeError}
                    </p>
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="px-2 py-0.5 bg-black text-white disabled:opacity-50"
                      disabled={resuming}
                      onClick={handleResume}
                    >
                      {t("sidebar.retry")}
                    </button>
                    <button
                      type="button"
                      className="px-2 py-0.5 border border-black"
                      disabled={resuming}
                      onClick={dismissResume}
                    >
                      {t("sidebar.dismissResume")}
                    </button>
                  </div>
                </div>
              ) : null}
              <ul className="mt-1 flex flex-col flex-1 min-h-0 overflow-y-auto w-full gap-0">
                {pageEntries.length === 0 ? (
                  <li className="text-xs text-[#555] py-2">{t("sidebar.queueEmpty")}</li>
                ) : (
                  pageEntries.map(([id, download]) => (
                    <Loader key={id} id={id} download={download} />
                  ))
                )}
              </ul>
              <div className="shrink-0 mt-2 space-y-1 border-t border-black/20 pt-2">
                {entries.length > QUEUE_PAGE_SIZE ? (
                  <div className="flex items-center justify-between text-xs gap-1">
                    <button
                      type="button"
                      disabled={page <= 0}
                      className="disabled:opacity-40 px-1"
                      onClick={() => setQueuePage((p) => Math.max(0, p - 1))}
                    >
                      {t("search.prev")}
                    </button>
                    <span>{t("sidebar.queuePage", { page: page + 1, total: totalPages })}</span>
                    <button
                      type="button"
                      disabled={page >= totalPages - 1}
                      className="disabled:opacity-40 px-1"
                      onClick={() => setQueuePage((p) => Math.min(totalPages - 1, p + 1))}
                    >
                      {t("search.next")}
                    </button>
                  </div>
                ) : null}
                {hasCancellable ? (
                  <button
                    type="button"
                    className="w-full text-left text-xs hover:underline"
                    onClick={() => void cancelAllActive()}
                  >
                    {t("sidebar.cancelAll")}
                  </button>
                ) : null}
                {hasFinished ? (
                  <button
                    type="button"
                    className="w-full text-left text-xs hover:underline"
                    onClick={() => invoke("clear_finished_downloads")}
                  >
                    {t("sidebar.clearFinished")}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {open && tab === "history" ? (
            <>
              <ul className="mt-1 flex flex-col flex-1 min-h-0 overflow-y-auto w-full gap-1">
                {pageHistory.length === 0 ? (
                  <li className="text-xs text-[#555] py-2">{t("sidebar.historyEmpty")}</li>
                ) : (
                  pageHistory.map((item) => (
                    <li key={item.id} className="text-xs border-b border-black/10 py-1">
                      <p className="truncate font-medium" title={item.title}>
                        {item.title || t("download.titleFallback")}
                      </p>
                      <p className="truncate text-[10px] text-[#555]" title={item.filename}>
                        {item.filename || new Date(item.finishedAt).toLocaleString()}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-0.5">
                        {item.filename ? (
                          <>
                            <button
                              type="button"
                              className="text-[10px] underline"
                              onClick={() => openHistoryFile(item.filename)}
                            >
                              {t("sidebar.openFile")}
                            </button>
                            <button
                              type="button"
                              className="text-[10px] underline"
                              onClick={() => openHistoryFolder(item.filename)}
                            >
                              {t("sidebar.openHistoryFolder")}
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          className="text-[10px] underline"
                          onClick={() => setHistory(removeDownloadHistoryItem(item.id))}
                        >
                          {t("sidebar.removeHistoryItem")}
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
              <div className="shrink-0 mt-2 space-y-1 border-t border-black/20 pt-2">
                {history.length > HISTORY_PAGE_SIZE ? (
                  <div className="flex items-center justify-between text-xs gap-1">
                    <button
                      type="button"
                      disabled={histPage <= 0}
                      className="disabled:opacity-40 px-1"
                      onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                    >
                      {t("search.prev")}
                    </button>
                    <span>
                      {t("sidebar.queuePage", { page: histPage + 1, total: historyTotalPages })}
                    </span>
                    <button
                      type="button"
                      disabled={histPage >= historyTotalPages - 1}
                      className="disabled:opacity-40 px-1"
                      onClick={() =>
                        setHistoryPage((p) => Math.min(historyTotalPages - 1, p + 1))
                      }
                    >
                      {t("search.next")}
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="w-full text-left text-xs hover:underline"
                  onClick={exportHistory}
                >
                  {t("sidebar.exportHistory")}
                </button>
                <button
                  type="button"
                  className="w-full text-left text-xs hover:underline"
                  onClick={() => {
                    setHistory(clearDownloadHistory());
                    setHistoryPage(0);
                  }}
                >
                  {t("search.historyClear")}
                </button>
                <button
                  type="button"
                  className="w-full text-left text-xs hover:underline"
                  onClick={() => {
                    navigate("/");
                    requestAnimationFrame(() => {
                      setTimeout(() => document.getElementById("search")?.focus(), 50);
                    });
                  }}
                >
                  {t("search.historyTitle")}
                </button>
              </div>
            </>
          ) : null}

          {!open ? (
            <ul className="flex flex-col items-center gap-1 flex-1 min-h-0 overflow-y-auto w-full">
              {activeCollapsed.map(([id, download]) => (
                <CircularProgressBar key={id} download={download} />
              ))}
            </ul>
          ) : null}

          <div className={`shrink-0 mt-2 ${open ? "" : "flex justify-center"}`}>
            {open ? (
              <>
                <FolderPicker />
                <CookiesSettings />
                <UpdateChecker />
              </>
            ) : (
              <button
                type="button"
                className="size-8 p-1 hover:opacity-70"
                onClick={openDownloadFolder}
                title={t("sidebar.openFolder")}
                aria-label={t("sidebar.openFolder")}
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
