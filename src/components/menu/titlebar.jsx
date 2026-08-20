import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { isTauri } from "../../lib/tauri_env";
import { PLAYER_ENABLED } from "../../lib/feature_flags";
import {
  APP_MODES,
  modeFromPath,
  pathForMode,
  saveAppMode,
} from "../../lib/app_mode";

export default function TitleBar({ onMaximizedChange }) {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const mode = modeFromPath(location.pathname);

  useEffect(() => {
    if (!isTauri()) return undefined;

    const win = getCurrentWindow();
    let cancelled = false;
    let unlisten;

    const sync = async () => {
      if (cancelled) return;
      const next = await win.isMaximized();
      if (cancelled) return;
      setMaximized(next);
      onMaximizedChange?.(next);
    };

    sync();
    win
      .onResized(() => {
        sync();
      })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [onMaximizedChange]);

  function setMode(next) {
    saveAppMode(next);
    navigate(pathForMode(next));
  }

  const modeToggle = (
    <div className="relative z-10 flex items-center gap-1 text-[11px] mr-2">
      <button
        type="button"
        className={`px-2 py-0.5 border border-black rounded ${
          mode === APP_MODES.DOWNLOAD ? "bg-black text-white" : "bg-white"
        }`}
        onClick={() => setMode(APP_MODES.DOWNLOAD)}
      >
        {t("app.modeDownload")}
      </button>
      {PLAYER_ENABLED ? (
        <button
          type="button"
          className={`px-2 py-0.5 border border-black rounded ${
            mode === APP_MODES.PLAYER ? "bg-black text-white" : "bg-white"
          }`}
          onClick={() => setMode(APP_MODES.PLAYER)}
        >
          {t("app.modePlayer")}
        </button>
      ) : null}
    </div>
  );

  if (!isTauri()) {
    return (
      <div className="titlebar shrink-0 flex items-center justify-between px-3 select-none">
        {modeToggle}
        <span className="text-[13px] font-medium tracking-wide text-[#1d1d1f] select-none absolute left-1/2 -translate-x-1/2">
          {t("app.name")}
        </span>
        <div className="w-[54px]" />
      </div>
    );
  }

  const win = getCurrentWindow();

  const handleTitleDoubleClick = (e) => {
    if (e.detail === 2) {
      win.toggleMaximize();
    }
  };

  return (
    <div className="titlebar shrink-0 flex items-center select-none relative px-3">
      <div
        className="absolute inset-0"
        data-tauri-drag-region
        onDoubleClick={handleTitleDoubleClick}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-[13px] font-medium tracking-wide text-[#1d1d1f]">
          {t("app.name")}
        </span>
      </div>

      <div className="relative z-10 flex items-center w-[140px] shrink-0">
        {modeToggle}
      </div>
      <div className="flex-1 min-w-0" />

      <div className="titlebar-controls relative z-10 flex items-center gap-[8px] w-[54px] shrink-0 justify-end">
        <button
          type="button"
          className="titlebar-btn titlebar-btn--min"
          aria-label={t("app.minimize")}
          title={t("app.minimize")}
          onClick={() => win.minimize()}
        >
          −
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn--max"
          aria-label={t("app.maximize")}
          title={t("app.maximize")}
          onClick={() => win.toggleMaximize()}
        >
          {maximized ? "↘" : "+"}
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn--close"
          aria-label={t("app.close")}
          title={t("app.close")}
          onClick={() => win.close()}
        >
          ×
        </button>
      </div>
    </div>
  );
}
