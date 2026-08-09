import { describe, expect, it } from "vitest";
import {
  formatDurationDisplay,
  formatNowPlayingDisplay,
  sanitizeDisplayText,
} from "./player_display.js";

describe("sanitizeDisplayText", () => {
  it("strips quotes, periods, and Spanish punctuation", () => {
    expect(sanitizeDisplayText(`"What's up?" ¿Hola!`)).toBe("Whats up Hola");
    expect(sanitizeDisplayText("Song… title.")).toBe("Song title");
    expect(sanitizeDisplayText("«álbum»")).toBe("album");
  });

  it("folds accents and n tilde", () => {
    expect(sanitizeDisplayText("Á À á à")).toBe("A A a a");
    expect(sanitizeDisplayText("Ñ ñ")).toBe("N n");
    expect(sanitizeDisplayText("DeBÍ TiRAR MáS FOToS")).toBe("DeBI TiRAR MaS FOToS");
    expect(sanitizeDisplayText("EL CLÚB")).toBe("EL CLUB");
  });

  it("keeps useful separators for collaborator lists", () => {
    expect(sanitizeDisplayText("A & B, C - D")).toBe("A & B, C - D");
  });

  it("turns ft. into ft without breaking the rest", () => {
    expect(sanitizeDisplayText("Artist ft. Guest")).toBe("Artist ft Guest");
  });

  it("collapses whitespace and handles empty input", () => {
    expect(sanitizeDisplayText("  a   b  ")).toBe("a b");
    expect(sanitizeDisplayText("")).toBe("");
    expect(sanitizeDisplayText(null)).toBe("");
  });
});

describe("formatDurationDisplay", () => {
  it("formats seconds as mm:ss", () => {
    expect(formatDurationDisplay(125)).toBe("2:05");
    expect(formatDurationDisplay(59)).toBe("0:59");
  });

  it("formats long tracks as h:mm:ss", () => {
    expect(formatDurationDisplay(3661)).toBe("1:01:01");
  });

  it("keeps clock strings and ignores empty", () => {
    expect(formatDurationDisplay("3:45")).toBe("3:45");
    expect(formatDurationDisplay("")).toBe("");
    expect(formatDurationDisplay(null)).toBe("");
  });
});

describe("formatNowPlayingDisplay", () => {
  it("joins title, artists, album, duration", () => {
    expect(
      formatNowPlayingDisplay({
        title: "Midnight!",
        uploader: "Ada & Bea",
        album: "Neon.",
        duration: 185,
      }),
    ).toBe("Midnight - Ada & Bea - Neon - 3:05");
  });

  it("omits missing segments cleanly", () => {
    expect(
      formatNowPlayingDisplay({
        title: "Solo",
        uploader: "",
        duration: "4:00",
      }),
    ).toBe("Solo - 4:00");
    expect(formatNowPlayingDisplay({ title: "Only Title" })).toBe("Only Title");
    expect(formatNowPlayingDisplay(null)).toBe("");
  });

  it("prefers artist over uploader when both exist", () => {
    expect(
      formatNowPlayingDisplay({
        title: "Track",
        artist: "Primary",
        uploader: "Channel",
        duration: "1:00",
      }),
    ).toBe("Track - Primary - 1:00");
  });

  it("splits Artist - Title | Album for BMW-style order", () => {
    expect(
      formatNowPlayingDisplay({
        title: "BAD BUNNY - BATICANO (Visualizer) | nadie sabe lo que va a pasar mañana",
        duration: "4:10",
      }),
    ).toBe("BATICANO - BAD BUNNY - nadie sabe lo que va a pasar manana - 4:10");
  });

  it("moves feat into interpreters", () => {
    expect(
      formatNowPlayingDisplay({
        title: "BOOMERANG (feat. Coi Leray)",
        uploader: "DaBaby",
        duration: "3:00",
      }),
    ).toBe("BOOMERANG - DaBaby ft Coi Leray - 3:00");
  });
});
