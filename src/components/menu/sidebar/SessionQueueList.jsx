import { useTranslation } from "react-i18next";
import { videoKey } from "../../../lib/youtube_id";

export default function SessionQueueList({
  sessionQueue,
  nowPlaying,
  playerStatus,
  onPlay,
  onRemove,
  onClearSession,
  onSaveNowPlaying,
}) {
  const { t } = useTranslation();
  return (
    <>
      <ul className="mt-1 flex flex-col flex-1 min-h-0 overflow-y-auto w-full gap-0">
        {sessionQueue.length === 0 ? (
          <li className="text-xs text-[#555] py-2">{t("sidebar.sessionEmpty")}</li>
        ) : (
          sessionQueue.map((item) => {
            const active = nowPlaying && videoKey(nowPlaying) === videoKey(item);
            return (
              <li
                key={item.id}
                className={`border-b border-black/15 py-1.5 px-0.5 text-xs flex gap-1 items-start ${
                  active ? "bg-black text-white" : "hover:bg-[#f3f3f3]"
                }`}
              >
                <button
                  type="button"
                  className="flex-1 text-left min-w-0"
                  onClick={() => void onPlay(item)}
                >
                  <span className="block truncate font-medium">{item.title}</span>
                  {active && (playerStatus === "caching" || playerStatus === "waiting") ? (
                    <span className="block text-[10px] text-white/70">
                      {playerStatus === "waiting"
                        ? t("player.statusWaiting")
                        : t("player.statusCaching")}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={`shrink-0 text-[10px] underline ${active ? "text-white/80" : ""}`}
                  onClick={() => onRemove(item.id)}
                >
                  {t("player.remove")}
                </button>
              </li>
            );
          })
        )}
      </ul>
      <div className="shrink-0 mt-2 space-y-1 border-t border-black/20 pt-2">
        {sessionQueue.length > 0 ? (
          <button
            type="button"
            className="w-full text-left text-xs hover:underline"
            onClick={() => onClearSession()}
          >
            {t("sidebar.clearSession")}
          </button>
        ) : null}
        {nowPlaying ? (
          <button
            type="button"
            className="w-full text-left text-xs hover:underline"
            onClick={() => void onSaveNowPlaying(nowPlaying)}
          >
            {t("sidebar.saveNowPlaying")}
          </button>
        ) : null}
      </div>
    </>
  );
}
