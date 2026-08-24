import "./App.css";

import FileDesc from "./components/download/file_desc";
import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from "react-router-dom";
import SideBar from "./components/menu/sidebar";
import TitleBar from "./components/menu/titlebar";
import MobileShell from "./components/mobile/MobileShell";
import { useEffect, useRef, useState } from "react";
import { VideoProvider } from "./providers/video_context";
import { DownloadPathProvider } from "./providers/download_path_context";
import { DownloadQueueProvider } from "./providers/download_queue_context";
import {
  PlayerSessionProvider,
  usePlayerSession,
} from "./providers/player_session_context";
import Home from "./home";
import PlayerPage from "./player/PlayerPage";
import {
  APP_MODES,
  loadAppMode,
  modeFromPath,
  saveAppMode,
} from "./lib/app_mode";
import { invoke } from "@tauri-apps/api/core";
import { isMobile, isTauri } from "./lib/tauri_env";
import { PLAYER_ENABLED } from "./lib/feature_flags";

function ModeBootstrap() {
  const navigate = useNavigate();
  const location = useLocation();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (
      PLAYER_ENABLED &&
      location.pathname === "/" &&
      loadAppMode() === APP_MODES.PLAYER
    ) {
      navigate("/player", { replace: true });
    }
  }, [location.pathname, navigate]);

  return null;
}

/** Wipe ephemeral play cache when leaving Player or closing the window. */
function PlayerSessionLifecycle() {
  const location = useLocation();
  const { endSession } = usePlayerSession();
  const wasPlayer = useRef(false);

  useEffect(() => {
    const now = modeFromPath(location.pathname) === APP_MODES.PLAYER;
    if (wasPlayer.current && !now) {
      endSession();
    }
    wasPlayer.current = now;
  }, [location.pathname, endSession]);

  useEffect(() => {
    const onUnload = () => {
      if (isTauri()) invoke("clear_player_cache").catch(() => {});
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  return null;
}

function AppShell({ maximized, setMaximized }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isPlayer = modeFromPath(location.pathname) === APP_MODES.PLAYER;

  useEffect(() => {
    saveAppMode(modeFromPath(location.pathname));
  }, [location.pathname]);

  // Prefer collapsed sidebar in Player unless user already opened it this session.
  useEffect(() => {
    if (isPlayer) setOpen(false);
  }, [isPlayer]);

  return (
    <main
      className={`app-shell flex flex-col font-montreal ${
        maximized ? "app-shell--maximized" : "app-shell--windowed"
      }`}
    >
      <TitleBar onMaximizedChange={setMaximized} />
      <div className="flex-1 panel-fill flex flex-col min-h-0">
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <SideBar open={open} setOpen={setOpen} compact={isPlayer} />
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <Routes>
              <Route path="/" element={<Home open={open} />} />
              {PLAYER_ENABLED ? (
                <Route path="/player" element={<PlayerPage />} />
              ) : null}
              <Route path="/val" element={<FileDesc />} />
            </Routes>
          </div>
        </div>
      </div>
    </main>
  );
}

function App() {
  const [maximized, setMaximized] = useState(false);
  const mobile = isMobile();
  // HashRouter only on mobile: the Android webview origin is tauri://localhost,
  // where the History API can misbehave. Desktop keeps BrowserRouter untouched.
  const Router = mobile ? HashRouter : BrowserRouter;

  return (
    <VideoProvider>
      <DownloadPathProvider>
        <DownloadQueueProvider>
          <PlayerSessionProvider>
            <Router>
              {mobile ? (
                <MobileShell />
              ) : (
                <>
                  <ModeBootstrap />
                  {PLAYER_ENABLED ? <PlayerSessionLifecycle /> : null}
                  <AppShell maximized={maximized} setMaximized={setMaximized} />
                </>
              )}
            </Router>
          </PlayerSessionProvider>
        </DownloadQueueProvider>
      </DownloadPathProvider>
    </VideoProvider>
  );
}

export default App;
