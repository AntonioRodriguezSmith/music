import { useTranslation } from "react-i18next";

/**
 * Shows the current cookies.txt path plus the "choose file" / "clear" actions.
 * Pure presentation: dialog opening and persistence live in the parent.
 */
export default function CookieFileField({ file, onPick, onClear, onRefresh, refreshing }) {
  const { t } = useTranslation();
  return (
    <div>
      <p className="text-[10px] break-all">
        {t("cookies.file", { path: file || t("cookies.noFile") })}
      </p>
      <div className="flex gap-1 mt-1 flex-wrap">
        {onPick ? (
          <button
            type="button"
            className="p-1 px-2 bg-black text-white hover:bg-[#dfdfdf] hover:text-black rounded-full text-[10px]"
            onClick={onPick}
          >
            {t("cookies.chooseFile")}
          </button>
        ) : null}
        {file ? (
          <button
            type="button"
            className="p-1 px-2 border border-black rounded-full text-[10px]"
            onClick={onClear}
          >
            {t("cookies.clearFile")}
          </button>
        ) : null}
        <button
          type="button"
          disabled={refreshing}
          className="p-1 px-2 border border-black rounded-full text-[10px] disabled:opacity-50"
          onClick={onRefresh}
        >
          {refreshing ? t("cookies.refreshRunning") : t("cookies.refreshButton")}
        </button>
      </div>
    </div>
  );
}
