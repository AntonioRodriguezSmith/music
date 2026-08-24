import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDownloadHistory,
  exportDownloadHistoryText,
  loadDownloadHistory,
  pushDownloadHistory,
  removeDownloadHistoryItem,
  parentDirOf,
} from "./download_history";

const store = new Map();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  });
});

describe("download_history", () => {
  it("starts empty and pushes newest first", () => {
    expect(loadDownloadHistory()).toEqual([]);
    const a = pushDownloadHistory({ title: "A", filename: "a.m4a" });
    expect(a).toHaveLength(1);
    const b = pushDownloadHistory({ title: "B", filename: "b.m4a" });
    expect(b[0].title).toBe("B");
    expect(b).toHaveLength(2);
  });

  it("dedupes same title+filename", () => {
    pushDownloadHistory({ title: "A", filename: "a.m4a" });
    const next = pushDownloadHistory({ title: "A", filename: "a.m4a" });
    expect(next).toHaveLength(1);
  });

  it("clears and exports TSV lines", () => {
    pushDownloadHistory({
      title: "Song",
      filename: "song.m4a",
      url: "https://youtu.be/x",
      finishedAt: 1_700_000_000_000,
    });
    const text = exportDownloadHistoryText();
    expect(text).toContain("Song");
    expect(text).toContain("song.m4a");
    expect(text).toContain("https://youtu.be/x");
    expect(clearDownloadHistory()).toEqual([]);
    expect(loadDownloadHistory()).toEqual([]);
  });

  it("removes a single item by id", () => {
    const a = pushDownloadHistory({ title: "A", filename: "a.m4a" });
    const b = pushDownloadHistory({ title: "B", filename: "b.m4a" });
    const id = b[0].id;
    const next = removeDownloadHistoryItem(id);
    expect(next.map((h) => h.title)).toEqual(["A"]);
    expect(loadDownloadHistory()).toHaveLength(1);
    expect(a[0].title).toBe("A");
  });

  it("parentDirOf handles windows paths", () => {
    expect(parentDirOf("C:\\Users\\x\\Music\\song.m4a")).toBe("C:\\Users\\x\\Music");
    expect(parentDirOf("")).toBeNull();
  });

  it("parentDirOf handles posix paths (mobile)", () => {
    expect(parentDirOf("/storage/emulated/0/Music/song.m4a")).toBe(
      "/storage/emulated/0/Music",
    );
    expect(parentDirOf("song.m4a")).toBeNull();
  });
});
