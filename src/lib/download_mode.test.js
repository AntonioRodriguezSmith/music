import { describe, expect, it } from "vitest";
import {
  MODES,
  defaultOutputExt,
  loadDownloadMode,
  pickBestAudioFormatIndex,
  resolveOutputExt,
} from "./download_mode.js";

const formats = [
  { id: "140", ext: "m4a", audio_codec: "mp4a", bitrate: 128, video_codec: "none", resolution: "audio only" },
  { id: "251", ext: "webm", audio_codec: "opus", bitrate: 160, video_codec: "none", resolution: "audio only" },
  { id: "137", ext: "mp4", audio_codec: "mp4a", bitrate: 128, video_codec: "avc1", resolution: "1920x1080" },
];

describe("loadDownloadMode", () => {
  it("defaults to standard when nothing stored", () => {
    expect(loadDownloadMode()).toBe(MODES.STANDARD);
  });
});

describe("pickBestAudioFormatIndex", () => {
  it("prefers highest-bitrate audio-only stream", () => {
    expect(pickBestAudioFormatIndex(formats)).toBe(1);
  });

  it("falls back to index 0 when list is empty", () => {
    expect(pickBestAudioFormatIndex([])).toBe(0);
  });
});

describe("defaultOutputExt", () => {
  it("uses m4a for USB BMW mode", () => {
    expect(defaultOutputExt(MODES.USB_BMW, "webm")).toBe("m4a");
  });

  it("keeps source extension for PC and standard", () => {
    expect(defaultOutputExt(MODES.PC, "webm")).toBe("webm");
    expect(defaultOutputExt(MODES.STANDARD, "mp4")).toBe("mp4");
  });
});

describe("resolveOutputExt", () => {
  it("returns null when user picked output manually", () => {
    expect(resolveOutputExt(MODES.USB_BMW, "webm", true)).toBeNull();
  });

  it("returns mode default when user did not pick output", () => {
    expect(resolveOutputExt(MODES.USB_BMW, "webm", false)).toBe("m4a");
    expect(resolveOutputExt(MODES.STANDARD, "webm", false)).toBe("webm");
  });
});
