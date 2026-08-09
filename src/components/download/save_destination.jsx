import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { DownloadPathContext } from "../../providers/download_path_context";
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
      const folder = await open({
        directory: true,
        multiple: false,
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
      await openPath(path);
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
          onClick={openDownloadFolder}
        >
          {t("sidebar.openFolder")}
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
            onClick={handleSelectFolder}
            className="p-1.5 bg-black hover:bg-[#dfdfdf] hover:text-black text-white rounded-full px-3"
          >
            {t("folder.choosePath")}
          </button>
        </>
      ) : null}
    </div>
  );
}
