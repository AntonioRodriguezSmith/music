import { useTranslation } from "react-i18next";
import { usePlayerSession } from "../../providers/player_session_context";
import SessionQueueList from "../menu/sidebar/SessionQueueList";

/** Mobile session queue view (bottom-nav tab). */
export default function MobileQueue() {
  const { t } = useTranslation();
  const {
    sessionQueue,
    nowPlaying,
    status,
    requestPlay,
    removeFromSessionQueue,
    clearSessionQueue,
    addToPlaylist,
  } = usePlayerSession();

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <h1 className="shrink-0 px-4 py-3 text-sm font-medium border-b border-black">
        {t("sidebar.tabSession")}
      </h1>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        <SessionQueueList
          sessionQueue={sessionQueue}
          nowPlaying={nowPlaying}
          playerStatus={status}
          onPlay={(item) => void requestPlay(item, { force: true })}
          onRemove={removeFromSessionQueue}
          onClearSession={clearSessionQueue}
          onSaveNowPlaying={(video) => void addToPlaylist(video)}
        />
      </div>
    </div>
  );
}
