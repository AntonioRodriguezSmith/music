import { describe, expect, it, vi } from "vitest";
import { singleFlight } from "./auto_cookies_flight";

describe("singleFlight", () => {
  it("llama a fn una sola vez para llamadas concurrentes", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const [a, b] = [singleFlight(fn), singleFlight(fn)];
    await expect(a).resolves.toBe("ok");
    await expect(b).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("lanza de nuevo tras resolverse (no deja la promesa cacheada)", async () => {
    const fn = vi.fn().mockResolvedValue("x");
    await singleFlight(fn);
    await singleFlight(fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("propaga el error a todos los awaiters pero se libera", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    const a = singleFlight(fn);
    const b = singleFlight(fn);
    await expect(a).rejects.toThrow("boom");
    await expect(b).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
    // La siguiente llamada vuelve a ejecutar fn.
    await expect(singleFlight(fn)).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
