/**
 * A stable, order-independent hash of any JSON-ish value.
 *
 * "Stable" means object key order does not change the hash — so a `fn` that
 * returns `{a:1, b:2}` one tick and `{b:2, a:1}` the next is NOT reported as a
 * change. Non-JSON values are serialized structurally (undefined, functions,
 * symbols, bigint, Date, Map, Set, cycles) so the watcher never throws on them.
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): string => {
    if (v === null) return "null";
    const t = typeof v;
    if (t === "number") return Number.isFinite(v as number) ? String(v) : `#${String(v)}`;
    if (t === "boolean") return String(v);
    if (t === "string") return JSON.stringify(v);
    if (t === "undefined") return "undefined";
    if (t === "bigint") return `${String(v)}n`;
    if (t === "function") return `fn:${(v as Function).name || "anon"}`;
    if (t === "symbol") return `sym:${String(v)}`;
    // objects
    const obj = v as object;
    if (seen.has(obj)) return "[cycle]";
    seen.add(obj);
    let out: string;
    if (Array.isArray(obj)) {
      out = `[${obj.map(walk).join(",")}]`;
    } else if (obj instanceof Date) {
      out = `Date(${obj.getTime()})`;
    } else if (obj instanceof Map) {
      out = `Map{${[...obj.entries()].map(([k, val]) => `${walk(k)}=>${walk(val)}`).sort().join(",")}}`;
    } else if (obj instanceof Set) {
      out = `Set{${[...obj].map(walk).sort().join(",")}}`;
    } else {
      const keys = Object.keys(obj as Record<string, unknown>).sort();
      out = `{${keys.map((k) => `${JSON.stringify(k)}:${walk((obj as Record<string, unknown>)[k])}`).join(",")}}`;
    }
    seen.delete(obj);
    return out;
  };
  return walk(value);
}

/** FNV-1a 32-bit, returned as 8 hex chars. Fast, non-cryptographic — a change detector, not a checksum. */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The hash the watcher compares tick-to-tick. */
export const hashValue = (value: unknown): string => fnv1a(stableStringify(value));
