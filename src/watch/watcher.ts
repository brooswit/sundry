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
 * **Cadence.** `fn` is called immediately, then the loop repeats: wait for the
 * interval, wait for the previous `fn` to finish, then call `fn` again. So the
 * gap between successive `fn` starts is `max(interval, fn-duration)` — a `fn`
 * faster than the interval keeps a steady interval cadence; a slower one runs
 * back-to-back with no gap and no dropped ticks. A tick never overlaps the next.
 *
 * - The first call establishes the baseline and does NOT fire `onChange`.
 * - `fn` may be sync or async. `onChange` fires as soon as `fn` resolves, not at
 *   the next interval boundary.
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
  let haveBaseline = false;
  let prevHash: string | undefined;
  let stopped = false;
  let timerHandle: unknown;
  let releaseTimer: (() => void) | undefined;

  const observe = (next: T): void => {
    if (stopped) return;
    const h = hash(next);
    if (!haveBaseline) {
      prevValue = next;
      prevHash = h;
      haveBaseline = true;
    } else if (h !== prevHash) {
      const prev = prevValue;
      prevValue = next;
      prevHash = h;
      onChange(next, prev);
    }
  };

  // Call fn; never rejects. Fires onChange as soon as fn resolves.
  const call = (): Promise<void> =>
    Promise.resolve()
      .then(fn)
      .then(observe, (err) => { if (!stopped) options.onError?.(err); });

  const waitInterval = (): Promise<void> =>
    new Promise<void>((resolve) => {
      releaseTimer = resolve;
      timerHandle = setT(resolve, intervalMs);
    });

  const run = async (): Promise<void> => {
    let pending = call(); // fn starts immediately (the baseline)
    while (!stopped) {
      await waitInterval();       // wait for the timeout
      await pending;              // wait for the previous fn to finish
      if (stopped) return;
      pending = call();           // then call fn again (its timeout is set next loop)
    }
  };

  void run();

  return () => {
    if (stopped) return;
    stopped = true;
    if (timerHandle !== undefined) clearT(timerHandle);
    releaseTimer?.(); // unblock any pending interval wait so the loop unwinds
  };
}
