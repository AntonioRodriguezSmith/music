import { useTranslation } from "react-i18next";
import SearchIcon from "../svg/search";
import QueueIcon from "../svg/queue";
import PlayIcon from "../svg/play";
import FolderIcon from "../svg/folder";

const TABS = [
  { id: "search", icon: SearchIcon, labelKey: "mobile.search" },
  { id: "queue", icon: QueueIcon, labelKey: "mobile.queue" },
  { id: "playlists", icon: PlayIcon, labelKey: "mobile.playlists" },
  { id: "settings", icon: FolderIcon, labelKey: "mobile.settings" },
];

/** Bottom navigation for the mobile shell. Fixed height + safe-area inset. */
export default function BottomNav({ tab, onChange }) {
  const { t } = useTranslation();
  return (
    <nav className="mobile-bottom-nav shrink-0 border-t border-black bg-white flex">
      {TABS.map(({ id, icon: Icon, labelKey }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            aria-label={t(labelKey)}
            aria-current={active ? "page" : undefined}
            className={`flex-1 min-h-12 flex flex-col items-center justify-center gap-0.5 py-1.5 ${
              active ? "bg-black text-white" : "text-black"
            }`}
            onClick={() => onChange(id)}
          >
            <span className="size-5">
              <Icon />
            </span>
            <span className="text-[10px] leading-none">{t(labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
