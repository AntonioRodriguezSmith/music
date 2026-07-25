import { describe, expect, it } from "vitest";
import { resolveInput } from "../lib/resolve_input.js";

describe("resolveInput", () => {
  it("returns null for empty input", () => {
    expect(resolveInput("")).toBeNull();
    expect(resolveInput("   ")).toBeNull();
    expect(resolveInput(null)).toBeNull();
  });

  it("treats bare 11-char ids as watch URLs", () => {
    expect(resolveInput("dQw4w9WgXcQ")).toEqual({
      type: "url",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("normalizes youtu.be and youtube.com without scheme", () => {
    expect(resolveInput("youtu.be/dQw4w9WgXcQ")).toEqual({
      type: "url",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });
    expect(resolveInput("www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      type: "url",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("keeps full https URLs", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(resolveInput(url)).toEqual({ type: "url", url });
  });

  it("treats free text as search", () => {
    expect(resolveInput("lofi hip hop")).toEqual({
      type: "search",
      query: "lofi hip hop",
    });
  });
});
