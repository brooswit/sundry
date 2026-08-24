# @brooswit/sundry

A toolbox of small, well-tested TypeScript utilities. Each one is independent; add more as you go.

## `watch(fn, onChange, intervalMs, options?)`

Polls `fn` on an interval and calls `onChange(next, prev)` whenever the value changes. Returns a `stop()`.

```ts
import { watch } from "@brooswit/sundry";

const stop = watch(
  () => fs.statSync("config.json").mtimeMs,   // sync or async
  (next, prev) => console.log("changed", prev, "→", next),
  1000,
);
// ...later
stop();   // idempotent
```

- **The first call is a baseline** — it captures the initial value and does *not* fire `onChange`.
- **Change is detected by a stable, order-independent hash**, so `{a:1,b:2}` → `{b:2,a:1}` is *not* a change.
- **`fn` may be sync or async.** A slow async `fn` never overlaps itself — a tick is skipped while the previous is still running.
- **A throw/reject skips that tick** (no change, baseline unchanged). Pass `options.onError` to observe it.
- **`options`**: `onError?`, `hash?` (override the hash), `setInterval?`/`clearInterval?` (inject timers, e.g. for tests).

Also exported: `hashValue`, `stableStringify`, `fnv1a`.

## Development

```
bun run check       # generate + typecheck + tests + coverage ≥90%   (what CI runs)
bun test
```

Every change to `src/` needs a `CHANGELOG.md` entry and a version bump (CI enforces it); merges to `main` publish to npm with provenance.
