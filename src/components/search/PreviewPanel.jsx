import { useTranslation } from "react-i18next";

export default function PreviewPanel({
  item,
  meta,
  enriching,
  selected,
  configuring,
  onToggleSelect,
  onOpen,
  open,
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`w-72 shrink-0 flex min-h-0 flex-col overflow-hidden border-l border-black ${
        open ? "hidden" : ""
      }`}
    >
      {item ? (
        <div className="flex flex-col flex-1 min-h-0 p-3 gap-3">
          <div className="w-full aspect-video overflow-hidden border border-black bg-[#eee] shrink-0">
            {item.thumbnail ? (
              <img
                src={item.thumbnail}
                alt={t("search.thumbnail")}
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-[#555]">
                {t("search.thumbnail")}
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 flex flex-col gap-2 overflow-hidden text-black">
            <p className="text-[10px] uppercase tracking-wide text-[#555] shrink-0">
              {t("search.previewInfo")}
              {enriching ? ` · ${t("search.previewEnriching")}` : ""}
            </p>
            <div className="space-y-1.5 overflow-y-auto min-h-0 pr-0.5">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#555]">
                  {t("search.colTitle")}
                </p>
                <p className="text-sm font-medium leading-snug" title={item.title}>
                  {item.title}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#555]">
                  {t("search.colArtist")}
                </p>
                <p className="text-xs truncate" title={meta?.channel}>
                  {meta?.channel || t("download.unknown")}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#555]">
                  {t("search.colDuration")}
                </p>
                <p className="text-xs tabular-nums">
                  {item.duration || t("download.unknown")}
                  {meta?.isLive ? ` · ${t("search.live")}` : ""}
                </p>
              </div>
              {meta?.views ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[#555]">
                    {t("search.views")}
                  </p>
                  <p className="text-xs tabular-nums">{meta.views}</p>
                </div>
              ) : null}
              {meta?.likes ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[#555]">
                    {t("search.likes")}
                  </p>
                  <p className="text-xs tabular-nums">{meta.likes}</p>
                </div>
              ) : null}
              {meta?.uploaded ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[#555]">
                    {t("search.uploadDate")}
                  </p>
                  <p className="text-xs">{meta.uploaded}</p>
                </div>
              ) : null}
              {meta?.videoId ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[#555]">
                    {t("search.videoId")}
                  </p>
                  <p className="text-xs font-mono truncate" title={meta.videoId}>
                    {meta.videoId}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="mt-auto flex flex-col gap-2 pt-2 shrink-0 border-t border-black/15">
              <p className="text-[10px] text-[#555] leading-snug">{t("search.previewNotFileMeta")}</p>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(item)}
                />
                {t("search.addToSelection")}
              </label>
              <button
                type="button"
                disabled={configuring}
                onClick={() => onOpen(item)}
                className="w-full px-3 py-1.5 bg-black text-white text-sm hover:bg-[#dfdfdf] hover:text-black disabled:opacity-50"
              >
                {t("search.openResult")}
              </button>
              <p className="text-[10px] text-[#555] leading-snug">{t("search.previewHint")}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
