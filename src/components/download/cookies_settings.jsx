import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { loadCookiePrefs, saveCookiePrefs } from "../../lib/cookies_prefs";
import { friendlyError } from "../../lib/app_errors";
import { openExternalPath } from "../../lib/open_path";
import { singleFlight } from "../../hooks/auto_cookies_flight";
import { useVideo } from "../../providers/video_context";
import { useYtdlpVersion } from "../../hooks/use_ytdlp_version";
import { isMobile } from "../../lib/tauri_env";
import CookieFileField from "./cookies/CookieFileField";
import YtdlpVersionBadge from "./cookies/YtdlpVersionBadge";

export default function CookiesSettings() {
  const { t } = useTranslation();
  const { clearPreviewCache } = useVideo();
  // loadCookiePrefs() also drops the legacy browser key on first read.
  const [file, setFile] = useState(() => loadCookiePrefs().cookiesFile);
  const [openPanel, setOpenPanel] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshPath, setLastRefreshPath] = useState("");

  function applyFile(nextFile) {
    setFile(nextFile);
    saveCookiePrefs({ cookiesFile: nextFile });
    clearPreviewCache?.();
  }

  const ytdlpVersion = useYtdlpVersion(openPanel);

  async function pickCookiesFile() {
    try {
      const selected = await open({
        multiple: false,
        title: t("cookies.dialogTitle"),
        filters: [{ name: t("cookies.filterName"), extensions: ["txt"] }],
      });
      if (selected) applyFile(selected);
    } catch (e) {
      console.error(e);
    }
  }

  function clearCookiesFile() {
    applyFile("");
  }

  async function handleRefreshCookies() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMsg("");
    setLastRefreshPath("");
    try {
      // Reuse the single-flight guard so a startup refresh and a manual one
      // never run yt-dlp twice at the same time.
      const path = await singleFlight(() => invoke("refresh_cookies_all"));
      if (path) {
        applyFile(path);
        setLastRefreshPath(path);
        setRefreshMsg(t("cookies.refreshOk", { path }));
      }
    } catch (e) {
      console.error(e);
      setRefreshMsg(
        `${t("cookies.refreshFailedHint")}\n${friendlyError(e, t)}`,
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function openCookiesFolder() {
    try {
      const dir = await invoke("cookies_dir");
      if (dir) openExternalPath(dir);
    } catch (e) {
      console.error(e);
      alert(t("sidebar.openFolderFailed"));
    }
  }

  return (
    <div className="pl-1 text-xs space-y-1 leading-5">
      <div className="flex items-center gap-2 min-w-0 py-0.5">
        <button
          type="button"
          className="min-w-0 flex-1 text-left text-sm font-medium leading-5 flex items-center gap-1 hover:underline"
          aria-expanded={openPanel}
          onClick={() => setOpenPanel((v) => !v)}
        >
          <span className="text-[10px] leading-none select-none w-3 shrink-0" aria-hidden>
            {openPanel ? "▾" : "▸"}
          </span>
          <span className="truncate">{t("cookies.title")}</span>
        </button>
        <button
          type="button"
          className="shrink-0 text-xs font-normal leading-5 hover:underline"
          onClick={pickCookiesFile}
          title={t("cookies.chooseFile")}
        >
          {t("cookies.chooseFile")}
        </button>
      </div>
      {openPanel ? (
        <>
          <p className="text-[10px] text-gray-600 leading-snug">{t("cookies.hint")}</p>
          {refreshMsg ? (
            <p
              className={`text-[10px] leading-snug break-words whitespace-pre-wrap ${
                lastRefreshPath ? "text-green-700" : "text-red-600"
              }`}
            >
              {refreshMsg}
            </p>
          ) : null}
          {lastRefreshPath ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-[10px] text-green-700 underline hover:text-black shrink-0"
                onClick={() => openExternalPath(lastRefreshPath)}
              >
                {t("sidebar.openFile")}
              </button>
              <span className="text-[10px] text-gray-600 truncate" title={lastRefreshPath}>
                {lastRefreshPath}
              </span>
            </div>
          ) : null}
          <CookieFileField
            file={file}
            onClear={clearCookiesFile}
            onRefresh={handleRefreshCookies}
            refreshing={refreshing}
            showRefresh={!isMobile()}
          />
          {!isMobile() ? (
            <button
              type="button"
              className="text-[10px] text-gray-600 leading-snug underline hover:text-black"
              onClick={openCookiesFolder}
            >
              {t("sidebar.openFolder")}
            </button>
          ) : null}
          <YtdlpVersionBadge version={ytdlpVersion} />
        </>
      ) : null}
    </div>
  );
}
