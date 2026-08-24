import { useTranslation } from "react-i18next";
import FolderPicker from "../download/save_destination";
import PlayerFolderPanel from "../menu/player_folder_panel";
import CookiesSettings from "../download/cookies_settings";
import UpdateChecker from "../menu/update_checker";
import MusicaPanel from "./MusicaPanel";
import { PLAYER_ENABLED } from "../../lib/feature_flags";

/**
 * Centralized settings page: groups the panels that used to live in the
 * sidebar (folders, cookies, updates) plus the music normalization tool.
 */
export default function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

      <section className="border border-black p-4 space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide">
          {t("settings.folders")}
        </h2>
        <FolderPicker />
        {PLAYER_ENABLED ? <PlayerFolderPanel /> : null}
      </section>

      <section className="border border-black p-4 space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide">
          {t("settings.youtube")}
        </h2>
        <CookiesSettings />
      </section>

      <section className="border border-black p-4 space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide">
          {t("settings.music")}
        </h2>
        <MusicaPanel />
      </section>

      <section className="border border-black p-4 space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide">
          {t("settings.app")}
        </h2>
        <UpdateChecker />
      </section>
    </div>
  );
}
