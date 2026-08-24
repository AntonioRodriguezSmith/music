import { videoKey } from "../../../lib/youtube_id";
import CircularProgressBar from "../../ui/circle_progress";

export default function SidebarCollapsed({
  compact,
  sessionQueue,
  nowPlaying,
  activeCollapsed,
  onPlay,
}) {
  return (
    <ul className="flex flex-col items-center gap-1 flex-1 min-h-0 overflow-y-auto w-full">
      {compact ? (
        sessionQueue.slice(0, 6).map((item) => {
          const active = nowPlaying && videoKey(nowPlaying) === videoKey(item);
          return (
            <li key={item.id} className="w-full flex justify-center">
              <button
                type="button"
                title={item.title}
                className={`size-8 text-[9px] leading-none border border-black truncate px-0.5 ${
                  active ? "bg-black text-white" : "bg-white"
                }`}
                onClick={() => void onPlay(item)}
              >
                {(item.title || "?").slice(0, 2)}
              </button>
            </li>
          );
        })
      ) : (
        activeCollapsed.map(([id, download]) => (
          <CircularProgressBar key={id} download={download} />
        ))
      )}
    </ul>
  );
}
