import { videoKey } from "../../lib/youtube_id";
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
  return (
    <div
      key={videoKey(item) || index}
      style={{ height: SEARCH_ROW_HEIGHT_PX }}
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
      <p className="truncate min-w-0 text-left relative z-[1] pointer-events-none" title={item.title}>
        {item.title}
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
