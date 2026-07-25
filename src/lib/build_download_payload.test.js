import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildDownloadPayload } from "./build_download_payload";

vi.mock("./cookies_prefs", () => ({
  cookieInvokeArgs: () => ({
    cookies_file: "C:\\cookies.txt",
    cookies_from_browser: null,
  }),
}));

describe("buildDownloadPayload", () => {
  it("maps form fields and cookie args", () => {
    const payload = buildDownloadPayload({
      formData: { embed_metadata: true, output_ext: "m4a" },
      downloadPath: "D:\\Music",
      formatId: "140",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Song",
      sourceExt: "webm",
    });
    expect(payload.output_dir).toBe("D:\\Music");
    expect(payload.format).toBe("140");
    expect(payload.url).toContain("youtube.com");
    expect(payload.title).toBe("Song");
    expect(payload.output_ext).toBe("m4a");
    expect(payload.embed_metadata).toBe(true);
    expect(payload.cookies_file).toBe("C:\\cookies.txt");
  });

  it("nulls output_ext when it matches source container", () => {
    const payload = buildDownloadPayload({
      formData: { output_ext: "webm" },
      downloadPath: "",
      formatId: "bestaudio",
      url: "https://youtu.be/x",
      title: "T",
      sourceExt: "webm",
    });
    expect(payload.output_ext).toBeNull();
    expect(payload.output_dir).toBe("");
  });
});
