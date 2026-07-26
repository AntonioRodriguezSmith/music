import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import FolderPicker from "./save_destination";
import { DownloadPathContext } from "../../providers/download_path_context";
import CheckboxIcon from "../ui/checkbox";
import Download from "../svg/download";
import { invoke } from "@tauri-apps/api/core";
import { useVideo } from "../../providers/video_context";
import { useDownloadQueue } from "../../providers/download_queue_context";
import { buildDownloadPayload } from "../../lib/build_download_payload";
import { shouldTreatAsBulk } from "../../lib/bulk_download";
import { MODES, defaultOutputExt, resolveOutputExt } from "../../lib/download_mode";

const FULL_OUTPUT_EXTS = ["mp4", "mkv", "mov", "webm", "mp3", "m4a"];

function modeHintKey(mode) {
  if (mode === MODES.USB_BMW) return "download.modeUsbHint";
  if (mode === MODES.PC) return "download.modePcHint";
  return "download.modeStandardHint";
}

export default function DownloadConfig({
  selectedVideo,
  curr,
  downloadMode,
  onDownloadModeChange,
  userPickedOutput,
  onUserPickedOutput,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { downloadPath } = useContext(DownloadPathContext);
  const { bulkSelection, clearBulkSelection } = useVideo();
  const { registerDownloadConfig } = useDownloadQueue();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formData, setFormData] = useState({
    url: "",
    output_dir: "",
    output_ext: null,
    format: "",
    proxy_url: null,
    embed_subtitles: false,
    embed_metadata: false,
    embed_thumbnail: false,
    duration_raw: 0,
  });

  const format = selectedVideo.formats?.[curr];
  const source_ext = format?.ext;

  useEffect(() => {
    if (!source_ext) return;
    const resolved = resolveOutputExt(downloadMode, source_ext, userPickedOutput);
    setFormData((prev) => ({
      ...prev,
      output_ext: resolved ?? prev.output_ext ?? source_ext,
      duration_raw: selectedVideo.duration_raw,
      ...(downloadMode === MODES.USB_BMW
        ? { embed_metadata: true, embed_thumbnail: false }
        : {}),
    }));
  }, [curr, selectedVideo, source_ext, downloadMode, userPickedOutput]);

  if (!format) {
    return <p className="px-3 text-red-600 text-sm">{t("download.noFormats")}</p>;
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "output_ext") {
      onUserPickedOutput();
    }
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!String(downloadPath || "").trim()) {
      setError(t("download.needFolder"));
      return;
    }
    setBusy(true);
    const isBulk = shouldTreatAsBulk(bulkSelection);
    const targets = isBulk
      ? bulkSelection
      : [{ url: selectedVideo.url, title: selectedVideo.title }];

    const failures = [];
    try {
      for (const target of targets) {
        const payload = buildDownloadPayload({
          formData,
          downloadPath,
          formatId: isBulk ? "bestaudio/best" : format.id,
          url: target.url,
          title: target.title,
          sourceExt: source_ext,
        });
        try {
          const processId = await invoke("start_download", { config: payload });
          registerDownloadConfig(processId, payload);
        } catch (err) {
          console.error(err);
          failures.push(
            `${target.title || target.url}: ${
              typeof err === "string" ? err : err?.message || t("download.failed")
            }`,
          );
        }
      }
      if (failures.length) {
        setError(failures.join("\n"));
      } else {
        clearBulkSelection();
        navigate("/");
      }
    } finally {
      setBusy(false);
    }
  };

  const outputValue = formData.output_ext || source_ext || "mp4";
  const modeButtons = [
    { mode: MODES.STANDARD, label: t("download.modeStandard"), hint: t("download.modeStandardHint") },
    { mode: MODES.USB_BMW, label: t("download.modeUsb"), hint: t("download.modeUsbHint") },
    { mode: MODES.PC, label: t("download.modePc"), hint: t("download.modePcHint") },
  ];

  return (
    <form onSubmit={handleSubmit} className="px-3 py-2 h-full overflow-hidden flex flex-col text-sm">
      <div className="my-1 shrink-0">
        <FolderPicker />
      </div>

      <div className="shrink-0 flex flex-col gap-1 mb-2">
        <p className="text-xs">{t("download.modeLabel")}</p>
        <div className="flex gap-1">
          {modeButtons.map(({ mode, label, hint }) => (
            <button
              key={mode}
              type="button"
              title={hint}
              onClick={() => onDownloadModeChange(mode)}
              className={`flex-1 border border-black px-1.5 py-1 text-xs transition-colors ${
                downloadMode === mode ? "bg-black text-white" : "hover:bg-[#dfdfdf]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[#555] leading-snug">{t(modeHintKey(downloadMode))}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 shrink-0">
        <label className="flex items-center gap-2">
          <CheckboxIcon
            name="embed_subtitles"
            checked={formData.embed_subtitles}
            handleChange={handleChange}
          />
          {t("download.subtitles")}
        </label>
        <label className="flex items-center gap-2">
          <CheckboxIcon
            name="embed_metadata"
            checked={formData.embed_metadata}
            handleChange={handleChange}
          />
          {t("download.metadata")}
        </label>
        <label className="flex items-center gap-2">
          <CheckboxIcon
            name="embed_thumbnail"
            checked={formData.embed_thumbnail}
            handleChange={handleChange}
          />
          {t("download.thumbnail")}
        </label>
      </div>

      <div className="flex justify-center items-center py-2 flex-col gap-2 flex-1 min-h-0">
        <div className="flex items-end gap-4">
          <div className="flex flex-col">
            <p className="text-xs">{t("download.sourceFormat")}</p>
            <p className="text-xl">{source_ext || t("download.unknown")}</p>
          </div>
          <p className="pb-1">{t("download.to")}</p>
          <div className="flex flex-col">
            <label htmlFor="output-ext-select" className="text-xs">
              {t("download.outputFormat")}
            </label>
            <select
              name="output_ext"
              value={outputValue}
              onChange={handleChange}
              className="text-xl"
              id="output-ext-select"
            >
              {downloadMode === MODES.USB_BMW ? (
                <>
                  <option value="m4a">m4a</option>
                  <option value="mp3">mp3</option>
                </>
              ) : (
                FULL_OUTPUT_EXTS.map((ext) => (
                  <option key={ext} value={ext}>
                    {ext}
                  </option>
                ))
              )}
              {source_ext && !FULL_OUTPUT_EXTS.includes(source_ext) && downloadMode !== MODES.USB_BMW ? (
                <option value={source_ext}>{source_ext}</option>
              ) : null}
            </select>
          </div>
        </div>
        {downloadMode === MODES.USB_BMW &&
        outputValue !== defaultOutputExt(MODES.USB_BMW, source_ext) ? (
          <p className="text-[10px] text-[#555]">{t("download.modeUsbFallback")}</p>
        ) : null}
        {error ? (
          <p className="text-red-600 text-xs max-w-sm text-center whitespace-pre-wrap">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="bg-black text-white hover:bg-[#dfdfdf] hover:text-black rounded-full px-5 py-2 flex items-center transition duration-300 disabled:opacity-50 text-base"
        >
          <span className="pr-2">
            {busy ? t("download.starting") : t("download.download", { ext: outputValue })}
          </span>
          <span className="size-6">
            <Download />
          </span>
        </button>
      </div>
    </form>
  );
}
