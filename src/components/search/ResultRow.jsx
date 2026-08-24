import { videoKey } from "../../lib/youtube_id";
import { isMobile } from "../../lib/tauri_env";
import { SEARCH_RESULT_GRID, SEARCH_ROW_HEIGHT_PX } from "../../lib/search_constants";

export default function ResultRow({
  item,
  index,
  active,
  selected,
  onHover,
  onToggleSelect,
  onOpen,
}) {
  const rowHeight = isMobile() ? Math.max(SEARCH_ROW_HEIGHT_PX, 52) : SEARCH_ROW_HEIGHT_PX;
  // "Título — Intérprete": keep the standalone interpreter column and also put
  // the interpreter ahead of the song title, but only when it adds info.
  const interpreter = item.channel || item.uploader;
  const titleText = interpreter
    ? `${item.title} — ${interpreter}`
    : item.title;

  return (
    <div
      key={videoKey(item) || index}
      style={{ height: rowHeight }}
      className={`${SEARCH_RESULT_GRID} relative border-b border-black text-sm shrink-0 box-border ${
        active ? "bg-black text-white" : "bg-white text-black hover:bg-black hover:text-white"
      }`}
      onMouseEnter={() => onHover(index)}
    >
      <input
        type="checkbox"
        className="shrink-0 relative z-10 justify-self-start"
        checked={selected}
        onChange={(e) => {
          e.stopPropagation();
          onToggleSelect(item);
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <p className="truncate min-w-0 text-left relative z-[1] pointer-events-none" title={titleText}>
        {titleText}
      </p>
      <p className="truncate min-w-0 text-left relative z-[1] pointer-events-none" title={item.uploader}>
        {item.uploader}
      </p>
      <p className="min-w-0 text-right tabular-nums relative z-[1] pointer-events-none">
        {item.duration}
      </p>
      <button
        type="button"
        className="absolute inset-0 z-[2]"
        aria-label={item.title}
        onClick={() => onOpen(item)}
      />
    </div>
  );
}
