import { describe, expect, it } from "vitest";
import { extractYouTubeId, videoKey } from "./youtube_id.js";

describe("extractYouTubeId", () => {
  it("extracts bare ids", () => {
    expect(extractYouTubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts watch URLs with different hosts", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(extractYouTubeId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("dedupes videos that only differ by URL form", () => {
    const a = { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "A" };
    const b = { url: "https://youtu.be/dQw4w9WgXcQ", title: "B" };
    expect(videoKey(a)).toBe(videoKey(b));
  });
});
