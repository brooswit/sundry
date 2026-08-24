# Changelog

All notable changes to `@brooswit/sundry`. Format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
entries are `## [x.y.z] - YYYY-MM-DD` with subsections from: `BREAKING`, `Added`, `Changed`, `Fixed`, `Removed`.
CI refuses a merge that changes `src/`, `schema/` or `package.json` without a new entry here.

## Versioning — what the numbers mean in this project

- **MAJOR** — a restructuring or rewrite that breaks a lot of things, requiring reimplementation by consumers. Requires a `### BREAKING` section.
- **MINOR** — a new feature, or a change to an existing feature that breaks just that feature.
- **PATCH** — a fix or correction that requires no consumer code changes, or very minor ones.

## [0.2.1] - 2026-08-24
### Changed
- Internal: `watch`'s scheduler is now a simpler loop — wait the interval, wait the previous `fn`, then call `fn` again — replacing the concurrent-timer bookkeeping. Behavior is unchanged: same `max(interval, fn-duration)` cadence, no overlap, no dropped ticks, and `onChange` still fires as soon as `fn` resolves.

## [0.2.0] - 2026-08-24
### Changed
- `watch` scheduling now adapts: each tick runs the interval timer and `fn` concurrently, and the next tick begins when BOTH finish — `max(interval, fn-duration)`. A `fn` faster than the interval keeps a steady cadence; a `fn` slower than the interval runs back-to-back with no gap and no dropped ticks (previously an overlapping tick was skipped). Timer injection option renamed `setInterval`/`clearInterval` → `setTimeout`/`clearTimeout`.

## [0.1.0] - 2026-08-24
### Added
- `watch(fn, onChange, intervalMs, options?)` — polls `fn` on an interval and calls `onChange(next, prev)` when a stable hash of its return value changes; returns an idempotent `stop()`. The first call is a baseline (no callback), `fn` may be sync or async (a slow async `fn` never overlaps itself), a throw/reject skips the tick (optional `onError`), and object key order does not trigger a false change.
- `hashValue` / `stableStringify` / `fnv1a` — the order-independent hashing behind `watch`, exported for reuse.
