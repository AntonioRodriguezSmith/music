import { describe, expect, it } from "vitest";
import { isPrimaryFormat } from "./format_details.js";

describe("isPrimaryFormat", () => {
  it("keeps real audio streams", () => {
    expect(
      isPrimaryFormat({
        ext: "webm",
        audio_codec: "opus",
        bitrate: 160,
        video_codec: "none",
        resolution: "audio only",
      }),
    ).toBe(true);
  });

  it("keeps real video streams", () => {
    expect(
      isPrimaryFormat({
        ext: "mp4",
        audio_codec: "mp4a",
        video_codec: "avc1",
        resolution: "1920x1080",
        bitrate: 2000,
      }),
    ).toBe(true);
  });

  it("hides mhtml and storyboards from primary list", () => {
    expect(isPrimaryFormat({ ext: "mhtml", resolution: "storyboard" })).toBe(false);
    expect(
      isPrimaryFormat({
        ext: "jpg",
        video_codec: "none",
        audio_codec: "none",
        resolution: "storyboard",
      }),
    ).toBe(false);
  });
});
