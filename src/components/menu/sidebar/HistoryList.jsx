import { useTranslation } from "react-i18next";

export default function HistoryList({
  pageHistory,
  historyTotalPages,
  histPage,
  onPrevPage,
  onNextPage,
  onOpenFile,
  onOpenFolder,
  onRemove,
  onExport,
  onClear,
  onFocusSearch,
  focusLabel,
}) {
  const { t } = useTranslation();
  return (
    <>
      <ul className="mt-1 flex flex-col flex-1 min-h-0 overflow-y-auto w-full gap-1">
        {pageHistory.length === 0 ? (
          <li className="text-xs text-[#555] py-2">{t("sidebar.historyEmpty")}</li>
        ) : (
          pageHistory.map((item) => (
            <li key={item.id} className="text-xs border-b border-black/10 py-1">
              <p className="truncate font-medium" title={item.title}>
                {item.title || t("download.titleFallback")}
              </p>
              <p className="truncate text-[10px] text-[#555]" title={item.filename}>
                {item.filename || new Date(item.finishedAt).toLocaleString()}
              </p>
              <div className="flex flex-wrap gap-2 mt-0.5">
                {item.filename ? (
                  <>
                    <button
                      type="button"
                      className="text-[10px] underline"
                      onClick={() => onOpenFile(item.filename)}
                    >
                      {t("sidebar.openFile")}
                    </button>
                    <button
                      type="button"
                      className="text-[10px] underline"
                      onClick={() => onOpenFolder(item.filename)}
                    >
                      {t("sidebar.openHistoryFolder")}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="text-[10px] underline"
                  onClick={() => onRemove(item.id)}
                >
                  {t("sidebar.removeHistoryItem")}
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
      <div className="shrink-0 mt-2 space-y-1 border-t border-black/20 pt-2">
        {historyTotalPages > 1 ? (
          <div className="flex items-center justify-between text-xs gap-1">
            <button
              type="button"
              disabled={histPage <= 0}
              className="disabled:opacity-40 px-1"
              onClick={onPrevPage}
            >
              {t("search.prev")}
            </button>
            <span>
              {t("sidebar.queuePage", { page: histPage + 1, total: historyTotalPages })}
            </span>
            <button
              type="button"
              disabled={histPage >= historyTotalPages - 1}
              className="disabled:opacity-40 px-1"
              onClick={onNextPage}
            >
              {t("search.next")}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="w-full text-left text-xs hover:underline"
          onClick={onExport}
        >
          {t("sidebar.exportHistory")}
        </button>
        <button
          type="button"
          className="w-full text-left text-xs hover:underline"
          onClick={onClear}
        >
          {t("search.historyClear")}
        </button>
        <button
          type="button"
          className="w-full text-left text-xs hover:underline"
          onClick={onFocusSearch}
        >
          {focusLabel}
        </button>
      </div>
    </>
  );
}
