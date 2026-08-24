import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import CookiesSettings from "../download/cookies_settings";

/** Mobile settings view (bottom-nav tab): cookies import + app-managed dirs. */
export default function MobileSettings() {
  const { t } = useTranslation();
  const [dirs, setDirs] = useState(null);

  useEffect(() => {
    invoke("mobile_default_dirs")
      .then((d) => setDirs(d))
      .catch(() => setDirs(null));
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <h1 className="shrink-0 px-4 py-3 text-sm font-medium border-b border-black">
        {t("mobile.settings")}
      </h1>
      <div className="px-4 py-3 space-y-4">
        <section className="space-y-1">
          <CookiesSettings />
        </section>
        <section className="space-y-1 border-t border-black/10 pt-3">
          <div className="text-[10px] uppercase tracking-wide text-[#555]">
            {t("mobile.storage")}
          </div>
          {dirs ? (
            <dl className="space-y-2 text-xs">
              <div>
                <dt className="text-[10px] text-[#777]">{t("mobile.downloadDir")}</dt>
                <dd className="break-all text-[#333]">{dirs.downloadDir}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-[#777]">{t("mobile.keepDir")}</dt>
                <dd className="break-all text-[#333]">{dirs.keepDir}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-[#777]">{t("mobile.cookiesDir")}</dt>
                <dd className="break-all text-[#333]">{dirs.cookiesDir}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-[#777]">{t("mobile.storageUnavailable")}</p>
          )}
        </section>
        <p className="text-[10px] text-[#777] leading-snug pt-2 border-t border-black/10">
          {t("mobile.settingsHint")}
        </p>
      </div>
    </div>
  );
}
