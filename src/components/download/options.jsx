import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildFormatLabel,
  buildFormatQuality,
  isAudioOnlyFormat,
  isPrimaryFormat,
} from "../../lib/format_details";
import { FORMAT_PAGE_SIZE } from "../../lib/search_constants";

export default function Options({ curr, setCurr, selectedVideo, onUserPickFormat }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const formats = selectedVideo.formats;
  const videoUrl = selectedVideo?.url;

  useEffect(() => {
    setPage(0);
    setShowAll(false);
  }, [videoUrl]);

  const { orderedFormats, hasSecondary, totalPages } = useMemo(() => {
    if (!formats?.length) {
      return { orderedFormats: [], hasSecondary: false, totalPages: 1 };
    }

    const indexed = formats.map((fmt, originalIndex) => ({ fmt, originalIndex }));
    const visible = showAll ? indexed : indexed.filter(({ fmt }) => isPrimaryFormat(fmt));
    const secondary = indexed.some(({ fmt }) => !isPrimaryFormat(fmt));

    const ordered = [...visible].sort((a, b) => {
      const aAudio = isAudioOnlyFormat(a.fmt);
      const bAudio = isAudioOnlyFormat(b.fmt);

      if (aAudio !== bAudio) {
        return aAudio ? -1 : 1;
      }

      if (aAudio && bAudio) {
        const bitrateDiff = (b.fmt.bitrate || 0) - (a.fmt.bitrate || 0);
        if (bitrateDiff !== 0) return bitrateDiff;

        const sizeDiff = (b.fmt.filesize_raw || 0) - (a.fmt.filesize_raw || 0);
        if (sizeDiff !== 0) return sizeDiff;
      }

      return a.originalIndex - b.originalIndex;
    });

    return {
      orderedFormats: ordered,
      hasSecondary: secondary,
      totalPages: Math.max(1, Math.ceil(ordered.length / FORMAT_PAGE_SIZE)),
    };
  }, [formats, showAll]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages - 1));
  }, [totalPages]);

  if (!formats) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-lg font-bold animate-pulse">{t("download.loading")}</p>
      </div>
    );
  }

  const safePage = Math.min(page, totalPages - 1);
  const pageFormats = orderedFormats.slice(
    safePage * FORMAT_PAGE_SIZE,
    safePage * FORMAT_PAGE_SIZE + FORMAT_PAGE_SIZE,
  );

  const goToPrevPage = () => setPage((prev) => Math.max(0, prev - 1));
  const goToNextPage = () => setPage((prev) => Math.min(totalPages - 1, prev + 1));

  const handlePick = (originalIndex) => {
    onUserPickFormat?.();
    setCurr(originalIndex);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="grid shrink-0 grid-cols-[4.5rem_minmax(5rem,7rem)_1fr_4.5rem] items-center gap-2 border-b border-black bg-[#f4f4f4] px-2 py-1.5 text-xs font-medium">
        <span className="text-left">{t("formats.colExt")}</span>
        <span className="text-left">{t("formats.colType")}</span>
        <span className="text-center">{t("formats.colQuality")}</span>
        <span className="text-right">{t("formats.colSize")}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {pageFormats.map(({ fmt, originalIndex }) => {
          const label = buildFormatLabel(fmt, t);
          const quality = buildFormatQuality(fmt);
          const secondary = !isPrimaryFormat(fmt);
          const selected = originalIndex === curr;

          return (
            <button
              type="button"
              onClick={() => handlePick(originalIndex)}
              key={fmt.id || `${fmt.ext}-${originalIndex}`}
              className={`${
                selected
                  ? "bg-black text-white"
                  : "bg-transparent text-black hover:bg-black hover:text-white"
              } grid w-full grid-cols-[4.5rem_minmax(5rem,7rem)_1fr_4.5rem] items-center gap-2 border-b border-black px-2 py-2 text-sm transition-colors ${
                secondary && !selected ? "opacity-60" : ""
              }`}
            >
              <span className="truncate text-left font-medium">{fmt.ext}</span>
              <span className="truncate text-left text-xs">{label}</span>
              <span className="truncate text-center text-xs font-medium">{quality}</span>
              <span className="truncate text-right text-xs">{fmt.filesize || "—"}</span>
            </button>
          );
        })}
      </div>
      <div className="flex shrink-0 flex-col gap-1 border-t border-black bg-[#f4f4f4] px-2 py-1.5 text-xs">
        {hasSecondary ? (
          <button
            type="button"
            className="w-full text-left hover:underline"
            onClick={() => {
              setShowAll((prev) => !prev);
              setPage(0);
            }}
          >
            {showAll ? t("formats.showPrimary") : t("formats.showAll")}
          </button>
        ) : null}
        {orderedFormats.length > FORMAT_PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={safePage <= 0}
              className="min-w-20 rounded border border-transparent px-3 py-1 text-left hover:border-black hover:bg-black hover:text-white disabled:pointer-events-none disabled:opacity-40"
              onClick={goToPrevPage}
              aria-label={t("search.prev")}
            >
              {t("search.prev")}
            </button>
            <span className="shrink-0">{t("formats.page", { page: safePage + 1, total: totalPages })}</span>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              className="min-w-20 rounded border border-transparent px-3 py-1 text-right hover:border-black hover:bg-black hover:text-white disabled:pointer-events-none disabled:opacity-40"
              onClick={goToNextPage}
              aria-label={t("search.next")}
            >
              {t("search.next")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
