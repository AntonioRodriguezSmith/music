import { useTranslation } from "react-i18next";

export default function SearchHistoryDropdown({ history, onPick, onClear, onRemove }) {
  const { t } = useTranslation();
  return (
    <div
      className="absolute left-0 right-11 z-30 mt-2 max-h-56 overflow-y-auto rounded-xl border border-black bg-white shadow-md"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#e5e5e5] px-3 py-2 text-xs">
        <span className="font-medium">{t("search.historyTitle")}</span>
        <button
          type="button"
          className="underline hover:no-underline"
          onClick={onClear}
        >
          {t("search.historyClear")}
        </button>
      </div>
      <ul className="text-sm">
        {history.map((item) => (
          <li key={item} className="flex items-stretch border-b border-gray-100 last:border-b-0">
            <button
              type="button"
              className="min-w-0 flex-1 truncate px-3 py-2 text-left hover:bg-black hover:text-white"
              onClick={() => onPick(item)}
              title={item}
            >
              {item}
            </button>
            <button
              type="button"
              className="shrink-0 px-3 text-xs hover:bg-black hover:text-white"
              onClick={(e) => onRemove(item, e)}
              aria-label={t("search.historyRemove")}
              title={t("search.historyRemove")}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
