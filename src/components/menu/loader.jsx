import Pause from "../svg/pause";
import Play from "../svg/play";
import Stop from "../svg/stop";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { isActive, isFinished, statusTranslationKey } from "../../lib/download_status";
import { parsePercentage } from "../../lib/parse_percentage";
import { isMobile } from "../../lib/tauri_env";

const supportsPauseResume =
  typeof navigator !== "undefined" &&
  !/Win/i.test(navigator.userAgent) &&
  !isMobile();

export default function Loader({ id, download }) {
  const { t } = useTranslation();
  const finished = isFinished(download.status);
  const active = isActive(download.status);
  const key = statusTranslationKey(download.status);
  const isError = key === "error";
  const isRetrying = key === "retrying";
  const is403 = isError && /403/i.test(download.status || "");
  const statusLabel =
    isError && download.status?.startsWith("error")
      ? download.status
      : t(`download.status.${key}`);
  const pct = finished ? 100 : parsePercentage(download.percentage);
  const title = download.title || t("download.titleFallback");
  const meta = [download.speed, download.eta, download.file_size || download.fileSize]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex flex-col text-xs mb-2 shrink-0">
      <div className="flex-1 truncate" title={title}>
        {title}
      </div>
      <div className="flex items-center -mt-0.5 gap-1">
        <div
          className={`flex-1 min-w-0 ${isError ? "text-red-700" : isRetrying ? "text-amber-800" : ""}`}
          title={statusLabel}
        >
          <div className="truncate leading-tight font-medium">{statusLabel}</div>
          {meta ? <div className="truncate text-[10px] text-[#555]">{meta}</div> : null}
          {is403 ? (
            <p className="text-[10px] text-red-800 leading-tight">
              {t("download.cookiesHint403")}
            </p>
          ) : null}
          {isRetrying ? (
            <p className="text-[10px] text-amber-900 leading-tight">
              {t("download.status.retrying")}…
            </p>
          ) : null}
        </div>
        {supportsPauseResume ? (
          active ? (
            <button
              type="button"
              onClick={() => invoke("pause_download", { id: parseInt(id, 10) })}
              disabled={finished}
              className={`size-5 shrink-0 ${finished ? "opacity-50" : ""}`}
            >
              <Pause />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => invoke("resume_download", { id: parseInt(id, 10) })}
              disabled={finished}
              className={`size-5 shrink-0 ${finished ? "opacity-50" : ""}`}
            >
              <Play />
            </button>
          )
        ) : null}
        <button
          type="button"
          onClick={() => invoke("stop_download", { id: parseInt(id, 10) })}
          disabled={finished || download.status === "cancelled"}
          className={`size-5 shrink-0 ${finished || download.status === "cancelled" ? "opacity-50" : ""}`}
        >
          <Stop />
        </button>
      </div>
      <div className="relative flex justify-start border border-black border-solid overflow-hidden">
        <div
          className={`min-h-5 ${isError ? "bg-red-800" : "bg-black"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
        <p className="top-0 left-1 text-black absolute text-[10px] font-medium drop-shadow-[0_0_1px_#fff]">
          {`${Math.round(pct)}%`}
        </p>
      </div>
    </li>
  );
}
