import { describe, expect, test } from "bun:test";
import { watch } from "../../src/watch/watcher.js";

/** A manual clock: watch() calls setInterval; we fire ticks by hand for determinism. */
function manualClock() {
  let cb: (() => void) | null = null;
  let cleared = false;
  return {
    setInterval: (fn: () => void) => { cb = fn; return 1 as unknown; },
    clearInterval: () => { cleared = true; cb = null; },
    async tick() { if (cb) { cb(); await Promise.resolve(); await Promise.resolve(); } },
    get cleared() { return cleared; },
  };
}

describe("watch", () => {
  test("first call is baseline only — no onChange; fires on a real change with (next, prev)", async () => {
    const clk = manualClock();
    let n = 0; const values = [10, 10, 20, 20, 30];
    const changes: Array<[number, number]> = [];
    watch(() => values[n++]!, (next, prev) => changes.push([next, prev]), 5, clk);
    await Promise.resolve(); await Promise.resolve();      // baseline (10)
    await clk.tick();                                       // 10 — no change
    await clk.tick();                                       // 20 — change 10→20
    await clk.tick();                                       // 20 — no change
    await clk.tick();                                       // 30 — change 20→30
    expect(changes).toEqual([[20, 10], [30, 20]]);
  });

  test("order-independent hash: reordered object keys are not a change", async () => {
    const clk = manualClock();
    const seq = [{ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 9, b: 2 }];
    let n = 0; const changes: unknown[] = [];
    watch(() => seq[n++]!, (next) => changes.push(next), 5, clk);
    await Promise.resolve(); await Promise.resolve();
    await clk.tick();  // reordered — no change
    await clk.tick();  // a:9 — change
    expect(changes).toEqual([{ a: 9, b: 2 }]);
  });

  test("stop() clears the interval and is idempotent; no changes fire after stop", async () => {
    const clk = manualClock();
    let n = 0; const changes: number[] = [];
    const stop = watch(() => [1, 2, 3][n++]!, (v) => changes.push(v as number), 5, clk);
    await Promise.resolve(); await Promise.resolve();
    stop(); stop();                                         // idempotent
    expect(clk.cleared).toBe(true);
    await clk.tick();                                       // cb is null now
    expect(changes).toEqual([]);
  });

  test("a throw skips the tick (no change, baseline unchanged) and calls onError", async () => {
    const clk = manualClock();
    let n = 0; const errors: unknown[] = []; const changes: number[] = [];
    // 5, then throw, then 5 again → the throw must not register as a change to/from
    watch(() => { const v = [5, -1, 5, 9][n++]!; if (v === -1) throw new Error("boom"); return v; },
      (v) => changes.push(v as number), 5, { ...clk, onError: (e) => errors.push(e) });
    await Promise.resolve(); await Promise.resolve();       // baseline 5
    await clk.tick();                                       // throw → onError, skipped
    await clk.tick();                                       // 5 → same as baseline, no change
    await clk.tick();                                       // 9 → change 5→9
    expect(errors.length).toBe(1);
    expect(changes).toEqual([9]);
  });

  test("async fn: a slow tick does not overlap itself", async () => {
    const clk = manualClock();
    let inFlight = 0, maxInFlight = 0, n = 0;
    const stop = watch(async () => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20)); inFlight--; return n++; }, () => {}, 5, clk);
    await Promise.resolve();
    clk.tick(); clk.tick(); clk.tick();                     // fire 3 ticks while the first is still awaiting
    await new Promise((r) => setTimeout(r, 60));
    expect(maxInFlight).toBe(1);
    stop();
  });

  test("integration: real timers fire onChange", async () => {
    let n = 0; const changes: number[] = [];
    const stop = watch(() => [1, 1, 2][Math.min(n++, 2)]!, (v) => changes.push(v as number), 10);
    await new Promise((r) => setTimeout(r, 45));
    stop();
    expect(changes).toContain(2);
  });
});
