import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildQueueSnapshot,
  clearQueueSnapshot,
  loadQueueSnapshot,
  normalizeSnapshotForResume,
  saveQueueSnapshot,
} from "./queue_snapshot";

const store = new Map();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  });
});

describe("queue_snapshot", () => {
  it("saves and loads items with config", () => {
    saveQueueSnapshot([
      {
        id: "1",
        config: { url: "https://youtu.be/a", title: "A" },
        status: "queued",
      },
    ]);
    expect(loadQueueSnapshot()).toHaveLength(1);
    expect(loadQueueSnapshot()[0].config.url).toContain("youtu.be");
  });

  it("normalizes in-flight to interrupted", () => {
    const resume = normalizeSnapshotForResume([
      {
        id: "1",
        config: { url: "https://youtu.be/a", title: "A" },
        status: "downloading",
      },
      {
        id: "2",
        config: { url: "https://youtu.be/b", title: "B" },
        status: "queued",
      },
      {
        id: "3",
        config: { url: "https://youtu.be/c", title: "C" },
        status: "finished",
      },
    ]);
    expect(resume).toHaveLength(2);
    expect(resume[0].status).toBe("interrupted");
    expect(resume[1].status).toBe("queued");
  });

  it("buildQueueSnapshot skips finished and keeps active", () => {
    const configs = new Map([
      ["1", { url: "https://youtu.be/a", title: "A" }],
      ["2", { url: "https://youtu.be/b", title: "B" }],
    ]);
    const items = buildQueueSnapshot(configs, {
      1: { status: "downloading", title: "A" },
      2: { status: "finished", title: "B" },
    });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("1");
  });

  it("clears snapshot", () => {
    saveQueueSnapshot([{ id: "1", config: { url: "x" } }]);
    clearQueueSnapshot();
    expect(loadQueueSnapshot()).toEqual([]);
  });
});
