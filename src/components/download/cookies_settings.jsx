import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { loadCookiePrefs, saveCookiePrefs } from "../../lib/cookies_prefs";
import { isTauri } from "../../lib/tauri_env";
import { useVideo } from "../../providers/video_context";

export default function CookiesSettings() {
  const { t } = useTranslation();
  const { clearPreviewCache } = useVideo();
  const [file, setFile] = useState(() => loadCookiePrefs().cookiesFile);
  const [openPanel, setOpenPanel] = useState(false);
  const [ytdlpVersion, setYtdlpVersion] = useState("");
  const [refreshMsg, setRefreshMsg] = useState("");

  useEffect(() => {
    // Ensure legacy browser key is cleared (file-only prefs).
    loadCookiePrefs();
  }, []);

  // Auto-refresh cookies from the browser (default Firefox) on startup and
  // enrich them into cookies_merged.txt. Non-blocking: the panel only updates
  // when the command resolves. Falls back silently to the existing file.
  useEffect(() => {
    if (!isTauri()) return undefined;
    let cancelled = false;
    invoke("refresh_cookies")
      .then((path) => {
        if (cancelled || !path) return;
        setFile(path);
        persistFile(path);
        setRefreshMsg("");
      })
      .catch(() => {
        if (!cancelled) setRefreshMsg(t("cookies.refreshFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-profile cookies on startup: if nothing is configured yet, scan the
  // default cookies_youtube folder (C:\Users\<user>\cookies_youtube) and pick
  // the first .txt, persisting it so it survives restarts.
  useEffect(() => {
    if (!isTauri() || loadCookiePrefs().cookiesFile) return undefined;
    let cancelled = false;
    invoke("list_cookie_candidates")
      .then((files) => {
        if (cancelled || !Array.isArray(files) || files.length === 0) return;
        const preferred = files.find(
          (f) => /cookies\.txt$/i.test(f) || /cookies_(merged|chrome|edge|firefox)\.txt$/i.test(f),
        );
        const picked = preferred || files[0];
        setFile(picked);
        persistFile(picked);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!openPanel || !isTauri() || ytdlpVersion) return undefined;
    let cancelled = false;
    invoke("get_ytdlp_version")
      .then((v) => {
        if (!cancelled) setYtdlpVersion(String(v));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [openPanel, ytdlpVersion]);

  function persistFile(nextFile) {
    saveCookiePrefs({ cookiesFile: nextFile });
    clearPreviewCache?.();
  }

  async function pickCookiesFile() {
    try {
      const selected = await open({
        multiple: false,
        title: t("cookies.dialogTitle"),
        filters: [{ name: t("cookies.filterName"), extensions: ["txt"] }],
      });
      if (selected) {
        setFile(selected);
        persistFile(selected);
      }
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="pl-1 text-xs space-y-1 leading-5">
      <button
        type="button"
        className="w-full text-left text-sm font-medium leading-5 flex items-center gap-1 py-0.5 hover:underline"
        aria-expanded={openPanel}
        onClick={() => setOpenPanel((v) => !v)}
      >
        <span className="text-[10px] leading-none select-none w-3 shrink-0" aria-hidden>
          {openPanel ? "▾" : "▸"}
        </span>
        {t("cookies.title")}
      </button>
      {openPanel ? (
        <>
          <p className="text-[10px] text-gray-600 leading-snug">{t("cookies.hint")}</p>
          {refreshMsg ? (
            <p className="text-[10px] text-red-600 leading-snug">{refreshMsg}</p>
          ) : null}
          <div>
            <p className="text-[10px] break-all">
              {t("cookies.file", { path: file || t("cookies.noFile") })}
            </p>
            <div className="flex gap-1 mt-1 flex-wrap">
              <button
                type="button"
                className="p-1 px-2 bg-black text-white hover:bg-[#dfdfdf] hover:text-black rounded-full text-[10px]"
                onClick={pickCookiesFile}
              >
                {t("cookies.chooseFile")}
              </button>
              {file ? (
                <button
                  type="button"
                  className="p-1 px-2 border border-black rounded-full text-[10px]"
                  onClick={() => {
                    setFile("");
                    persistFile("");
                  }}
                >
                  {t("cookies.clearFile")}
                </button>
              ) : null}
            </div>
          </div>
          {ytdlpVersion ? (
            <p className="text-[10px] text-[#555] truncate" title={ytdlpVersion}>
              yt-dlp {ytdlpVersion}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
