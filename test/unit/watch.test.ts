import { describe, expect, test } from "bun:test";
import { watch } from "../../src/watch/watcher.js";

/**
 * A manual clock over setTimeout. Each `fireNext()` releases the oldest pending
 * timer and flushes microtasks — with a synchronous `fn`, that advances the
 * watch by exactly one full tick, deterministically.
 */
function manualClock() {
  const timers: Array<{ id: object; cb: () => void }> = [];
  let cleared = 0;
  return {
    setTimeout: (cb: () => void) => { const id = {}; timers.push({ id, cb }); return id; },
    clearTimeout: (id: unknown) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) { timers.splice(i, 1); cleared++; } },
    pending() { return timers.length; },
    clearedCount() { return cleared; },
    async fireNext() { const t = timers.shift(); if (t) t.cb(); for (let i = 0; i < 4; i++) await Promise.resolve(); },
  };
}
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

describe("watch — cadence & change detection", () => {
  test("first call is baseline (no onChange); fires on change with (next, prev)", async () => {
    const clk = manualClock();
    let n = 0; const values = [10, 10, 20, 20, 30];
    const changes: Array<[number, number]> = [];
    watch(() => values[n++]!, (next, prev) => changes.push([next, prev]), 5, clk);
    await flush();          // baseline 10 runs immediately
    await clk.fireNext();   // 10 — no change
    await clk.fireNext();   // 20 — change 10→20
    await clk.fireNext();   // 20 — no change
    await clk.fireNext();   // 30 — change 20→30
    expect(changes).toEqual([[20, 10], [30, 20]]);
  });

  test("reordered object keys are not a change (order-independent hash)", async () => {
    const clk = manualClock();
    const seq = [{ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 9, b: 2 }];
    let n = 0; const changes: unknown[] = [];
    watch(() => seq[n++]!, (next) => changes.push(next), 5, clk);
    await flush();
    await clk.fireNext();   // reordered — no change
    await clk.fireNext();   // a:9 — change
    expect(changes).toEqual([{ a: 9, b: 2 }]);
  });

  test("stop() clears the pending timer, is idempotent, and fires nothing after", async () => {
    const clk = manualClock();
    let n = 0; const changes: number[] = [];
    const stop = watch(() => [1, 2, 3][n++]!, (v) => changes.push(v as number), 5, clk);
    await flush();
    expect(clk.pending()).toBe(1);   // baseline done, waiting on the interval
    stop(); stop();                  // idempotent
    expect(clk.clearedCount()).toBe(1);
    await clk.fireNext();            // nothing scheduled / no effect
    expect(changes).toEqual([]);
  });

  test("a throw skips the tick (no change, baseline unchanged) and calls onError", async () => {
    const clk = manualClock();
    let n = 0; const errors: unknown[] = []; const changes: number[] = [];
    watch(() => { const v = [5, -1, 5, 9][n++]!; if (v === -1) throw new Error("boom"); return v; },
      (v) => changes.push(v as number), 5, { ...clk, onError: (e) => errors.push(e) });
    await flush();          // baseline 5
    await clk.fireNext();   // throw → onError, tick skipped
    await clk.fireNext();   // 5 — equals baseline, no change
    await clk.fireNext();   // 9 — change 5→9
    expect(errors.length).toBe(1);
    expect(changes).toEqual([9]);
  });
});

describe("watch — real-timer scheduling", () => {
  test("next tick waits for max(interval, fn-duration): a slow fn never overlaps, no ticks dropped", async () => {
    let inFlight = 0, maxInFlight = 0, calls = 0;
    const stamps: number[] = [];
    const start = Date.now();
    const stop = watch(async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      stamps.push(Date.now() - start); calls++;
      await new Promise((r) => setTimeout(r, 30));   // fn is slower than the 10ms interval
      inFlight--; return calls;
    }, () => {}, 10);
    await new Promise((r) => setTimeout(r, 130));
    stop();
    expect(maxInFlight).toBe(1);                      // never overlaps
    expect(calls).toBeGreaterThanOrEqual(3);          // ~ every 30ms, not dropped to fewer
    // consecutive starts are ~fn-duration apart (>= interval), i.e. back-to-back
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]! - stamps[i - 1]!).toBeGreaterThanOrEqual(25);
  });

  test("integration: a fast fn fires onChange on a steady interval", async () => {
    let n = 0; const changes: number[] = [];
    const stop = watch(() => [1, 1, 2][Math.min(n++, 2)]!, (v) => changes.push(v as number), 10);
    await new Promise((r) => setTimeout(r, 60));
    stop();
    expect(changes).toContain(2);
  });
});
