import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { DownloadPathContext } from "../../providers/download_path_context";
import { openExternalPath } from "../../lib/open_path";
import { isTauri } from "../../lib/tauri_env";

/**
 * Download / audio destination picker.
 * @param {{ titleKey?: string, dialogTitleKey?: string }} props
 */
export default function FolderPicker({
  titleKey = "sidebar.setFolder",
  dialogTitleKey = "folder.dialogTitle",
} = {}) {
  const { t } = useTranslation();
  const { downloadPath, setDownloadPath } = useContext(DownloadPathContext);
  const [openPanel, setOpenPanel] = useState(false);

  async function handleSelectFolder() {
    try {
      const folder = await invoke("pick_download_dir", {
        title: t(dialogTitleKey),
      });
      if (folder) {
        setDownloadPath(folder);
      }
    } catch (error) {
      console.error("Error selecting folder:", error);
    }
  }

  async function openDownloadFolder() {
    if (!isTauri()) return;
    const path = String(downloadPath || "").trim();
    if (!path) {
      alert(t("download.needFolder"));
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
          <span className="truncate">{t(titleKey)}</span>
        </button>
        <button
          type="button"
          className="shrink-0 text-xs font-normal leading-5 hover:underline"
          onClick={handleSelectFolder}
          title={t("folder.choosePath")}
        >
          {t("folder.choosePath")}
        </button>
      </div>
      {openPanel ? (
        <>
          <p className="text-gray-600 truncate">
            {t("folder.currentPath", {
              path: downloadPath || t("folder.noFolder"),
            })}
          </p>
          <button
            type="button"
            className="text-[10px] text-gray-600 leading-snug underline hover:text-black"
            onClick={openDownloadFolder}
          >
            {t("sidebar.openFolder")}
          </button>
        </>
      ) : null}
    </div>
  );
}
