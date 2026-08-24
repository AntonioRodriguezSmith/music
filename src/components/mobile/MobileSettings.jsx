import { useTranslation } from "react-i18next";
import CookiesSettings from "../download/cookies_settings";
import PlayerFolderPanel from "../menu/player_folder_panel";

/** Mobile settings view (bottom-nav tab): cookies import + player folder. */
export default function MobileSettings() {
  const { t } = useTranslation();
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
          <PlayerFolderPanel />
        </section>
        <p className="text-[10px] text-[#777] leading-snug pt-2 border-t border-black/10">
          {t("mobile.settingsHint")}
        </p>
      </div>
    </div>
  );
}
