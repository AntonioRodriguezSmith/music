export function isAudioOnlyFormat(fmt) {
  return !fmt?.video_codec || fmt.video_codec === "none" || fmt.resolution === "audio only";
}

const REAL_AUDIO_CODECS = /^(opus|vorbis|mp4a|aac)/i;
const RESOLUTION_RE = /^\d+\s*x\s*\d+/i;

export function isPrimaryFormat(fmt) {
  if (!fmt) return false;
  const ext = (fmt.ext || "").toLowerCase();
  if (ext === "mhtml" || ext === "mht") return false;

  const resolution = String(fmt.resolution || "").toLowerCase();
  if (resolution.includes("storyboard")) return false;

  if (isAudioOnlyFormat(fmt)) {
    const codec = fmt.audio_codec || "";
    if (!codec || codec === "none") return false;
    return REAL_AUDIO_CODECS.test(codec) || Boolean(fmt.bitrate);
  }

  const vcodec = fmt.video_codec || "";
  if (!vcodec || vcodec === "none") return false;
  return RESOLUTION_RE.test(String(fmt.resolution || ""));
}

export function formatAudioCodecLabel(codec) {
  if (!codec || codec === "none") return null;
  if (codec.startsWith("mp4a")) return "AAC";
  if (codec === "opus") return "Opus";
  if (codec === "vorbis") return "Vorbis";
  return codec.toUpperCase();
}

export function formatVideoCodecLabel(codec) {
  if (!codec || codec === "none") return null;
  const normalized = codec.toLowerCase();
  if (normalized.startsWith("avc1") || normalized.includes("h264")) return "H.264";
  if (normalized.startsWith("vp9")) return "VP9";
  if (normalized.startsWith("vp8")) return "VP8";
  if (normalized.startsWith("av01") || normalized.includes("av1")) return "AV1";
  return codec.toUpperCase();
}

export function formatBitrateLabel(bitrate) {
  if (!bitrate) return null;
  return `${Math.round(bitrate)} kbps`;
}

export function formatSampleRateLabel(sampleRate) {
  if (!sampleRate) return null;
  return `${sampleRate} Hz`;
}

export function formatFpsLabel(fps) {
  if (!fps) return null;
  return `${Math.round(fps)} fps`;
}

export function buildFormatLabel(fmt, t) {
  if (isAudioOnlyFormat(fmt)) {
    return t("formats.audioOnly");
  }
  return fmt.resolution || t("formats.video");
}

export function buildFormatQuality(fmt) {
  const codec = formatAudioCodecLabel(fmt.audio_codec);
  const bitrate = formatBitrateLabel(fmt.bitrate);

  if (isAudioOnlyFormat(fmt)) {
    const parts = [bitrate, codec].filter(Boolean);
    return parts.length ? parts.join(" · ") : "—";
  }

  const parts = [];
  if (fmt.fps) parts.push(formatFpsLabel(fmt.fps));
  if (codec) parts.push(codec);
  return parts.length ? parts.join(" · ") : "—";
}

export function buildKeyDataItems(fmt, t) {
  const audioOnly = isAudioOnlyFormat(fmt);

  const fields = audioOnly
    ? [
        {
          key: "audio_codec",
          label: t("formatDetails.audioCodec"),
          value: formatAudioCodecLabel(fmt.audio_codec),
        },
        {
          key: "bitrate",
          label: t("formatDetails.bitrate"),
          value: formatBitrateLabel(fmt.bitrate),
        },
        {
          key: "sample_rate",
          label: t("formatDetails.sampleRate"),
          value: formatSampleRateLabel(fmt.sample_rate),
        },
        {
          key: "ext",
          label: t("formatDetails.extension"),
          value: fmt.ext || null,
        },
        {
          key: "filesize",
          label: t("formatDetails.size"),
          value: fmt.filesize || null,
        },
      ]
    : [
        {
          key: "resolution",
          label: t("formatDetails.resolution"),
          value: fmt.resolution || null,
        },
        {
          key: "fps",
          label: t("formatDetails.fps"),
          value: formatFpsLabel(fmt.fps),
        },
        {
          key: "audio_codec",
          label: t("formatDetails.audioCodec"),
          value: formatAudioCodecLabel(fmt.audio_codec),
        },
        {
          key: "video_codec",
          label: t("formatDetails.videoCodec"),
          value: formatVideoCodecLabel(fmt.video_codec),
        },
        {
          key: "bitrate",
          label: t("formatDetails.bitrate"),
          value: formatBitrateLabel(fmt.bitrate),
        },
        {
          key: "ext",
          label: t("formatDetails.extension"),
          value: fmt.ext || null,
        },
        {
          key: "filesize",
          label: t("formatDetails.size"),
          value: fmt.filesize || null,
        },
      ];

  return fields.filter((item) => item.value);
}
