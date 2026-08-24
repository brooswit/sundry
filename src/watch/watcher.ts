import { hashValue } from "../hash/stable-hash.js";

export interface WatchOptions<T> {
  /** Called if `fn` throws or rejects on a tick. The tick is skipped (no change fired, baseline unchanged). */
  onError?: (error: unknown) => void;
  /** Hash function used to detect change. Defaults to a stable, order-independent hash. */
  hash?: (value: T) => string;
  /** Timer injection, for tests. Defaults to the global timers. The handle is opaque. */
  setInterval?: (cb: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

/** Stop the watch. Idempotent. */
export type Stop = () => void;

/**
 * Poll `fn` on an interval; call `onChange(next, prev)` whenever the hash of its
 * return value changes. Returns a function that stops the interval.
 *
 * - The first call happens immediately and only establishes the baseline — it
 *   does NOT fire `onChange`.
 * - `fn` may be sync or async. A tick is skipped while a previous async `fn` is
 *   still running, so a slow `fn` never overlaps itself.
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
  const setI: (cb: () => void, ms: number) => unknown = options.setInterval ?? globalThis.setInterval;
  const clearI: (handle: unknown) => void = options.clearInterval ?? (globalThis.clearInterval as (h: unknown) => void);

  let prevValue: T;
  let prevHash: string | undefined; // undefined until the baseline is captured
  let running = false;
  let stopped = false;

  const tick = async (isBaseline: boolean): Promise<void> => {
    if (running || stopped) return;
    running = true;
    try {
      const next = await fn();
      if (stopped) return;
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
    } catch (err) {
      options.onError?.(err);
    } finally {
      running = false;
    }
  };

  void tick(true); // baseline, immediate
  const handle = setI(() => void tick(false), intervalMs);

  return () => {
    if (stopped) return;
    stopped = true;
    clearI(handle);
  };
}
