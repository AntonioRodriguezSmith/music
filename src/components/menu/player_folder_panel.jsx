import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { openExternalPath } from "../../lib/open_path";
import { isMobile, isTauri } from "../../lib/tauri_env";

/** Read-only Player media folder (keep dir). Path comes from Rust / env. */
export default function PlayerFolderPanel() {
  const { t } = useTranslation();
  const [openPanel, setOpenPanel] = useState(false);
  const [playerPath, setPlayerPath] = useState("");

  useEffect(() => {
    if (!isTauri()) return undefined;
    let cancelled = false;
    invoke("player_keep_dir")
      .then((dir) => {
        if (!cancelled) setPlayerPath(String(dir || ""));
      })
      .catch(() => {
        if (!cancelled) setPlayerPath("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function openPlayerFolder() {
    if (!isTauri()) return;
    const path = String(playerPath || "").trim();
    if (!path) {
      alert(t("sidebar.openFolderFailed"));
      return;
    }
    try {
      await openExternalPath(path);
    } catch (e) {
      console.error(e);
      const message =
        typeof e === "string" ? e : e?.message || t("sidebar.openFolderFailed");
      alert(message);
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
          <span className="truncate">{t("sidebar.setPlayerFolder")}</span>
        </button>
        {!isMobile() ? (
          <button
            type="button"
            className="shrink-0 text-xs font-normal leading-5 hover:underline"
            onClick={openPlayerFolder}
          >
            {t("sidebar.openFolder")}
          </button>
        ) : null}
      </div>
      {openPanel ? (
        <p className="text-gray-600 truncate" title={playerPath || undefined}>
          {t("folder.currentPath", {
            path: playerPath || t("folder.noFolder"),
          })}
        </p>
      ) : null}
    </div>
  );
}
