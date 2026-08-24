import { useTranslation } from "react-i18next";
import Loader from "../loader";

export default function QueueList({
  resumeItems,
  resumeError,
  resuming,
  onResume,
  onDismissResume,
  pageEntries,
  page,
  totalPages,
  onPrevPage,
  onNextPage,
  hasCancellable,
  onCancelAll,
  hasFinished,
  onClearFinished,
}) {
  const { t } = useTranslation();
  return (
    <>
      {resumeItems.length > 0 ? (
        <div className="shrink-0 mb-2 border border-black p-2 text-xs space-y-1 bg-[#f4f4f4]">
          <p>{t("sidebar.resumePending", { count: resumeItems.length })}</p>
          {resumeError ? (
            <p className="text-red-700 whitespace-pre-wrap break-words" role="alert">
              {t("sidebar.resumeFailed")}: {resumeError}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="px-2 py-0.5 bg-black text-white disabled:opacity-50"
              disabled={resuming}
              onClick={onResume}
            >
              {t("sidebar.retry")}
            </button>
            <button
              type="button"
              className="px-2 py-0.5 border border-black"
              disabled={resuming}
              onClick={onDismissResume}
            >
              {t("sidebar.dismissResume")}
            </button>
          </div>
        </div>
      ) : null}
      <ul className="mt-1 flex flex-col flex-1 min-h-0 overflow-y-auto w-full gap-0">
        {pageEntries.length === 0 ? (
          <li className="text-xs text-[#555] py-2">{t("sidebar.queueEmpty")}</li>
        ) : (
          pageEntries.map(([id, download]) => (
            <Loader key={id} id={id} download={download} />
          ))
        )}
      </ul>
      <div className="shrink-0 mt-2 space-y-1 border-t border-black/20 pt-2">
        {totalPages > 1 ? (
          <div className="flex items-center justify-between text-xs gap-1">
            <button
              type="button"
              disabled={page <= 0}
              className="disabled:opacity-40 px-1"
              onClick={onPrevPage}
            >
              {t("search.prev")}
            </button>
            <span>{t("sidebar.queuePage", { page: page + 1, total: totalPages })}</span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              className="disabled:opacity-40 px-1"
              onClick={onNextPage}
            >
              {t("search.next")}
            </button>
          </div>
        ) : null}
        {hasCancellable ? (
          <button
            type="button"
            className="w-full text-left text-xs hover:underline"
            onClick={() => void onCancelAll()}
          >
            {t("sidebar.cancelAll")}
          </button>
        ) : null}
        {hasFinished ? (
          <button
            type="button"
            className="w-full text-left text-xs hover:underline"
            onClick={onClearFinished}
          >
            {t("sidebar.clearFinished")}
          </button>
        ) : null}
      </div>
    </>
  );
}
