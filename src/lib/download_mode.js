import { isAudioOnlyFormat } from "./format_details";

const MODE_KEY = "clip_harbour_download_mode";

export const MODES = {
  STANDARD: "standard",
  USB_BMW: "usb_bmw",
  PC: "pc",
};

const VALID_MODES = new Set([MODES.STANDARD, MODES.USB_BMW, MODES.PC]);

export function loadDownloadMode() {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (VALID_MODES.has(stored)) return stored;
  } catch {
    /* ignore */
  }
  return MODES.STANDARD;
}

export function saveDownloadMode(mode) {
  try {
    if (VALID_MODES.has(mode)) {
      localStorage.setItem(MODE_KEY, mode);
    }
  } catch {
    /* ignore */
  }
}

function formatScore(fmt) {
  const audioOnly = isAudioOnlyFormat(fmt);
  const bitrate = fmt?.bitrate || 0;
  const opusBonus = fmt?.audio_codec === "opus" ? 0.5 : 0;
  return (audioOnly ? 1_000_000 : 0) + bitrate + opusBonus;
}

export function pickBestAudioFormatIndex(formats) {
  if (!formats?.length) return 0;

  let bestIndex = 0;
  let bestScore = -Infinity;

  formats.forEach((fmt, index) => {
    const score = formatScore(fmt);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

export function defaultOutputExt(mode, sourceExt) {
  if (mode === MODES.USB_BMW) return "m4a";
  return sourceExt || "webm";
}

export function resolveOutputExt(mode, sourceExt, userPickedOutput) {
  if (userPickedOutput) return null;
  return defaultOutputExt(mode, sourceExt);
}
