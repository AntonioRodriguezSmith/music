import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "../../lib/tauri_env";

export default function TitleBar({ onMaximizedChange }) {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

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

  if (!isTauri()) {
    return (
      <div className="titlebar shrink-0 flex items-center justify-center px-3 select-none">
        <span className="text-[13px] font-medium tracking-wide text-[#1d1d1f] select-none">
          {t("app.name")}
        </span>
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

      <div className="w-[54px] shrink-0" aria-hidden />
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
