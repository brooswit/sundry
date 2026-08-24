import { hashValue } from "../hash/stable-hash.js";

export interface WatchOptions<T> {
  /** Called if `fn` throws or rejects on a tick. The tick is skipped (no change fired, baseline unchanged). */
  onError?: (error: unknown) => void;
  /** Hash function used to detect change. Defaults to a stable, order-independent hash. */
  hash?: (value: T) => string;
  /** Timer injection, for tests. Defaults to the global timers. The handle is opaque. */
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

/** Stop the watch. Idempotent. */
export type Stop = () => void;

/**
 * Poll `fn`; call `onChange(next, prev)` whenever the hash of its return value
 * changes. Returns a function that stops the loop.
 *
 * **Cadence.** Each tick starts an interval timer *and* runs `fn` at the same
 * moment; the next tick begins when BOTH have finished — `max(interval,
 * fn-duration)`. So a `fn` faster than `interval` runs on a steady interval
 * cadence, and a `fn` slower than `interval` runs back-to-back with no gap and
 * no dropped ticks. A tick never overlaps the next.
 *
 * - The first call happens immediately and only establishes the baseline — it
 *   does NOT fire `onChange` (but the interval still elapses before tick two).
 * - `fn` may be sync or async.
 * - A throw/reject skips that tick (no change, baseline unchanged); `onError`
 *   sees it if provided.
 */
export function watch<T>(
  fn: () => T | Promise<T>,
  onChange: (next: T, prev: T) => void,
  intervalMs: number,
  options: WatchOptions<T> = {},
): Stop {
  const hash = options.hash ?? (hashValue as (value: T) => string);
  const setT: (cb: () => void, ms: number) => unknown = options.setTimeout ?? globalThis.setTimeout;
  const clearT: (handle: unknown) => void = options.clearTimeout ?? (globalThis.clearTimeout as (h: unknown) => void);

  let prevValue: T;
  let prevHash: string | undefined; // undefined until the baseline is captured
  let stopped = false;
  let timerHandle: unknown;
  let releaseTimer: (() => void) | undefined; // resolves the in-flight interval wait

  const runTick = async (isBaseline: boolean): Promise<void> => {
    if (stopped) return;

    // Start the interval clock NOW, concurrently with fn, so the wait below is
    // measured from tick start: the next tick is max(interval, fn-duration).
    const intervalElapsed = new Promise<void>((resolve) => {
      releaseTimer = resolve;
      timerHandle = setT(resolve, intervalMs);
    });

    try {
      const next = await fn();
      if (!stopped) {
        const h = hash(next);
        if (isBaseline || prevHash === undefined) {
          prevValue = next;
          prevHash = h;
        } else if (h !== prevHash) {
          const prev = prevValue;
          prevValue = next;
          prevHash = h;
          onChange(next, prev);
        }
      }
    } catch (err) {
      if (!stopped) options.onError?.(err);
    }

    await intervalElapsed; // wait until the interval has also elapsed (if fn was faster)
    if (stopped) return;
    void runTick(false);
  };

  void runTick(true);

  return () => {
    if (stopped) return;
    stopped = true;
    if (timerHandle !== undefined) clearT(timerHandle);
    releaseTimer?.(); // unblock any pending interval wait so the loop unwinds
  };
}
