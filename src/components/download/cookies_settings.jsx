import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  clearBrowserCookiePref,
  loadCookiePrefs,
  saveCookiePrefs,
} from "../../lib/cookies_prefs";
import { isTauri } from "../../lib/tauri_env";

export default function CookiesSettings() {
  const { t } = useTranslation();
  const [file, setFile] = useState(() => loadCookiePrefs().cookiesFile);
  const [openPanel, setOpenPanel] = useState(false);
  const [ytdlpVersion, setYtdlpVersion] = useState("");

  useEffect(() => {
    // Drop legacy "from browser" selection so yt-dlp never gets both flags.
    clearBrowserCookiePref();
    const prefs = loadCookiePrefs();
    if (prefs.cookiesFile) {
      saveCookiePrefs({ cookiesFromBrowser: "", cookiesFile: prefs.cookiesFile });
    }
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
    saveCookiePrefs({ cookiesFromBrowser: "", cookiesFile: nextFile });
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
    <div className="mt-2 pl-1 text-xs space-y-1">
      <button
        type="button"
        className="w-full text-left text-sm font-medium flex items-center gap-1 hover:underline"
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
