import { useEffect, useState } from "react";
import { saveAppMode, APP_MODES } from "../../lib/app_mode";
import BottomNav from "./BottomNav";
import MobileSearch from "./MobileSearch";
import MobileQueue from "./MobileQueue";
import MobilePlaylists from "./MobilePlaylists";
import MobileSettings from "./MobileSettings";

/**
 * Mobile (Android) shell: replaces the desktop titlebar + sidebar with a
 * bottom navigation. Desktop layout is untouched — see App.jsx.
 */
export default function MobileShell() {
  const [tab, setTab] = useState("search");

  useEffect(() => {
    saveAppMode(APP_MODES.PLAYER);
  }, []);

  return (
    <main className="app-shell mobile-shell flex flex-col font-montreal">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {tab === "search" ? <MobileSearch /> : null}
        {tab === "queue" ? <MobileQueue /> : null}
        {tab === "playlists" ? <MobilePlaylists /> : null}
        {tab === "settings" ? <MobileSettings /> : null}
      </div>
      <BottomNav tab={tab} onChange={setTab} />
    </main>
  );
}
