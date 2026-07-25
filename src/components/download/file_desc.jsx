import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Options from "./options";
import Arrow from "../svg/arrow";
import Plus from "../svg/plus";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useVideo } from "../../providers/video_context";
import DownloadConfig from "./download_config";
import { buildKeyDataItems } from "../../lib/format_details";
import {
  loadDownloadMode,
  pickBestAudioFormatIndex,
  saveDownloadMode,
} from "../../lib/download_mode";

export default function FileDesc() {
  const { t } = useTranslation();
  const [curr, setCurr] = useState(0);
  const [collapse, setCollapse] = useState(true);
  const [downloadMode, setDownloadMode] = useState(loadDownloadMode);
  const [userPickedFormat, setUserPickedFormat] = useState(false);
  const [userPickedOutput, setUserPickedOutput] = useState(false);
  const { selectedVideo, bulkSelection } = useVideo();

  useEffect(() => {
    setUserPickedFormat(false);
    setUserPickedOutput(false);
  }, [selectedVideo?.url]);

  useEffect(() => {
    if (!selectedVideo?.formats?.length || userPickedFormat) return;
    setCurr(pickBestAudioFormatIndex(selectedVideo.formats));
  }, [selectedVideo?.url, selectedVideo?.formats, downloadMode, userPickedFormat]);

  const handleModeChange = (mode) => {
    saveDownloadMode(mode);
    setDownloadMode(mode);
    setUserPickedFormat(false);
    setUserPickedOutput(false);
  };

  if (!selectedVideo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 min-h-0 overflow-hidden">
        <p className="text-2xl font-light animate-pulse">{t("download.fetching")}</p>
        <Link to="/" className="text-sm underline">
          {t("download.backToSearch")}
        </Link>
        <p className="text-sm text-gray-600 max-w-md text-center px-4">{t("download.fetchHint")}</p>
      </div>
    );
  }

  const selectedFormat = selectedVideo.formats?.[curr];
  const keyDataItems = selectedFormat ? buildKeyDataItems(selectedFormat, t) : [];

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      <div className="flex shrink-0 p-2">
        <Link
          to="/"
          className="rotate-90 size-10 border border-solid rounded-full border-black flex items-center justify-center"
        >
          <Arrow />
        </Link>
      </div>
      {bulkSelection.length > 1 ? (
        <p className="shrink-0 text-sm px-3 py-1 bg-black text-white">
          {t("download.bulkBanner", { count: bulkSelection.length })}
        </p>
      ) : null}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-[1.5] min-h-0 overflow-hidden flex flex-col border-r border-black">
          <button
            type="button"
            onClick={() => setCollapse(!collapse)}
            className={`${
              collapse ? "text-black" : "bg-black text-white"
            } shrink-0 min-h-10 border-b border-black flex items-center text-base pl-3`}
          >
            <span className="size-6 mr-1">
              <Plus />
            </span>
            {t("download.keyData")}
          </button>
          {!collapse ? (
            <div className="shrink-0 grid grid-cols-2 px-3 py-2 gap-x-2 gap-y-1 text-xs max-h-32 overflow-y-auto">
              {keyDataItems.map((item) => (
                <div key={item.key} className="flex min-w-0 truncate">
                  <span className="mr-1 shrink-0">{item.label}:</span>
                  <span className="font-medium truncate">{item.value}</span>
                </div>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setCollapse(true)}
            className={`w-full shrink-0 hover:bg-black hover:text-white ${
              collapse
                ? "bg-black text-white border-white border-b"
                : "border-black border-y"
            } min-h-10 border-solid flex items-center pl-3 text-base`}
          >
            <span className="size-6 mr-1">
              <Plus />
            </span>
            {t("download.availableFormats")}
          </button>
          <div className="flex-1 min-h-0 overflow-hidden h-full">
            <Options
              setCurr={setCurr}
              curr={curr}
              selectedVideo={selectedVideo}
              onUserPickFormat={() => setUserPickedFormat(true)}
            />
          </div>
        </div>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 h-40 border-b border-black flex overflow-hidden">
            <img
              src={selectedVideo?.thumbnail}
              alt={t("search.thumbnail")}
              className="object-cover object-top w-full h-full bg-green-50"
            />
          </div>
          <div className="shrink-0 flex flex-col items-start px-2 py-1">
            <p className="text-base font-medium truncate w-full">{selectedVideo?.title}</p>
            <button
              type="button"
              onClick={() => openUrl(selectedVideo?.url)}
              className="text-xs underline truncate max-w-full text-left hover:text-blue-500"
            >
              {selectedVideo?.url}
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <DownloadConfig
              selectedVideo={selectedVideo}
              curr={curr}
              downloadMode={downloadMode}
              onDownloadModeChange={handleModeChange}
              userPickedOutput={userPickedOutput}
              onUserPickedOutput={() => setUserPickedOutput(true)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
