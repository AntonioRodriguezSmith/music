import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "../../lib/tauri_env";

/**
 * Silent check on mount + manual "Buscar actualizaciones" button.
 */
export default function UpdateChecker({ compact = false }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isTauri()) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const update = await check();
        if (cancelled || !update) return;
        setMessage(t("sidebar.updateAvailable", { version: update.version }));
      } catch {
        /* silent on startup — no release / network is fine */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function handleCheck() {
    if (!isTauri() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const update = await check();
      if (!update) {
        setMessage(t("sidebar.updateNone"));
        return;
      }
      const ok = window.confirm(
        t("sidebar.updateConfirm", { version: update.version }),
      );
      if (!ok) {
        setMessage(t("sidebar.updateAvailable", { version: update.version }));
        return;
      }
      setMessage(t("sidebar.updateInstalling"));
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      console.error(e);
      const detail =
        typeof e === "string" ? e : e?.message || t("sidebar.updateFailed");
      setMessage(detail);
    } finally {
      setBusy(false);
    }
  }

  if (!isTauri()) return null;

  return (
    <div className={`text-xs space-y-1 ${compact ? "" : "mt-2"}`}>
      <button
        type="button"
        className="w-full text-left hover:underline disabled:opacity-50"
        disabled={busy}
        onClick={() => void handleCheck()}
      >
        {busy ? t("sidebar.updateChecking") : t("sidebar.checkUpdates")}
      </button>
      {message ? (
        <p className="text-[10px] text-[#555] whitespace-pre-wrap break-words" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
