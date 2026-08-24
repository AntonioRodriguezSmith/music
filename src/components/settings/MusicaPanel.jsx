import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { DownloadPathContext } from "../../providers/download_path_context";
import { isMobile, isTauri } from "../../lib/tauri_env";
import { musicaAvailable, musicaCancel, musicaRun } from "../../lib/musica";

const STEPS = [
  { value: 0, key: "musica.stepFull" },
  { value: 1, key: "musica.step1" },
  { value: 2, key: "musica.step2" },
  { value: 3, key: "musica.step3" },
  { value: 4, key: "musica.step4" },
];

/**
 * Interactive music normalization tool. Desktop-only: PowerShell and the
 * `scripts/musica` pipeline do not exist on mobile.
 */
export default function MusicaPanel() {
  const { t } = useTranslation();
  const { downloadPath } = useContext(DownloadPathContext);
  const [status, setStatus] = useState(null);
  const [dir, setDir] = useState("");
  const [step, setStep] = useState(0);
  const [apply, setApply] = useState(false);
  const [deleteDuplicates, setDeleteDuplicates] = useState(false);
  const [removeJunk, setRemoveJunk] = useState(false);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!isTauri() || isMobile()) return undefined;
    musicaAvailable()
      .then(setStatus)
      .catch(() =>
        setStatus({ available: false, scriptsDir: "", error: "" }),
      );
  }, []);

  // Default the target folder to the configured download path.
  useEffect(() => {
    if (!dir && downloadPath) setDir(downloadPath);
  }, [dir, downloadPath]);

  useEffect(() => {
    if (!isTauri() || isMobile()) return undefined;
    let cancelled = false;
    let unline;
    let unexit;
    listen("musica://line", (event) => {
      if (!cancelled) setLines((prev) => [...prev, String(event.payload ?? "")]);
    }).then((fn) => {
      if (cancelled) fn();
      else unline = fn;
    });
    listen("musica://exit", (event) => {
      if (cancelled) return;
      setRunning(false);
      setLines((prev) => [
        ...prev,
        t("musica.exitCode", { code: event.payload?.code ?? "" }),
      ]);
    }).then((fn) => {
      if (cancelled) fn();
      else unexit = fn;
    });
    return () => {
      cancelled = true;
      if (unline) unline();
      if (unexit) unexit();
    };
  }, [t]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  async function pickFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("musica.selectFolder"),
      });
      if (selected) setDir(String(selected));
    } catch (e) {
      console.error(e);
    }
  }

  async function run() {
    if (running) return;
    setLines([]);
    setRunning(true);
    try {
      await musicaRun({ dir, step, apply, deleteDuplicates, removeJunk });
    } catch (e) {
      setRunning(false);
      setLines((prev) => [
        ...prev,
        typeof e === "string" ? e : e?.message || String(e),
      ]);
    }
  }

  async function cancel() {
    try {
      await musicaCancel();
    } catch (e) {
      console.error(e);
    }
  }

  if (!isTauri() || isMobile()) return null;

  const available = Boolean(status?.available);

  return (
    <div className="space-y-3 text-xs leading-5">
      {!available ? (
        <p className="text-red-700 break-words">
          {t("musica.unavailableHint", {
            dir: status?.scriptsDir || t("musica.unavailable"),
          })}
        </p>
      ) : null}

      <div className="space-y-1">
        <label className="block text-[10px] uppercase tracking-wide text-[#555]">
          {t("musica.folderLabel")}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="flex-1 min-w-0 border border-black px-2 py-1 text-xs"
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder={t("musica.folderPlaceholder")}
          />
          <button
            type="button"
            className="shrink-0 border border-black px-2 py-1 hover:bg-black hover:text-white"
            onClick={pickFolder}
          >
            {t("musica.chooseFolder")}
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-[10px] uppercase tracking-wide text-[#555]">
          {t("musica.stepLabel")}
        </label>
        <select
          className="w-full border border-black px-2 py-1 text-xs"
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
        >
          {STEPS.map((s) => (
            <option key={s.value} value={s.value}>
              {t(s.key)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <span className="block text-[10px] uppercase tracking-wide text-[#555]">
          {t("musica.modeLabel")}
        </span>
        <div className="flex items-center gap-1 text-[11px]">
          <button
            type="button"
            className={`px-2 py-0.5 border border-black rounded ${
              !apply ? "bg-black text-white" : "bg-white"
            }`}
            onClick={() => setApply(false)}
          >
            {t("musica.modeDry")}
          </button>
          <button
            type="button"
            className={`px-2 py-0.5 border border-black rounded ${
              apply ? "bg-black text-white" : "bg-white"
            }`}
            onClick={() => setApply(true)}
          >
            {t("musica.modeApply")}
          </button>
        </div>
      </div>

      {step === 1 ? (
        <div className="space-y-1">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={deleteDuplicates}
              onChange={(e) => setDeleteDuplicates(e.target.checked)}
            />
            <span>{t("musica.optionDeleteDuplicates")}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={removeJunk}
              onChange={(e) => setRemoveJunk(e.target.checked)}
            />
            <span>{t("musica.optionRemoveJunk")}</span>
          </label>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="border border-black px-3 py-1 hover:bg-black hover:text-white disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-black"
          disabled={!available || running}
          onClick={() => void run()}
        >
          {running ? t("musica.running") : t("musica.run")}
        </button>
        <button
          type="button"
          className="border border-black px-3 py-1 hover:bg-black hover:text-white disabled:opacity-40"
          disabled={!running}
          onClick={() => void cancel()}
        >
          {t("musica.cancel")}
        </button>
      </div>

      <div className="space-y-1">
        <span className="block text-[10px] uppercase tracking-wide text-[#555]">
          {t("musica.outputTitle")}
        </span>
        <pre
          ref={scrollRef}
          className="max-h-64 overflow-y-auto border border-black bg-black text-green-300 p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap break-words"
        >
          {lines.length > 0 ? lines.join("\n") : t("musica.empty")}
        </pre>
      </div>
    </div>
  );
}
