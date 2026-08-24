import { describe, expect, test } from "bun:test";
import { fnv1a, hashValue, stableStringify } from "../../src/hash/stable-hash.js";

describe("stableStringify", () => {
  test("is order-independent for object keys", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });
  test("distinguishes values, types, and nesting", () => {
    expect(stableStringify(1)).not.toBe(stableStringify("1"));
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
    expect(stableStringify({ a: { b: 1 } })).not.toBe(stableStringify({ a: { b: 2 } }));
    expect(stableStringify(null)).not.toBe(stableStringify(undefined));
  });
  test("serializes non-JSON values without throwing", () => {
    expect(() => stableStringify({ d: new Date(0), m: new Map([["k", 1]]), s: new Set([1, 2]), b: 1n, f: () => 0, sy: Symbol("x"), n: NaN })).not.toThrow();
    expect(stableStringify(new Date(5))).toBe("Date(5)");
    expect(stableStringify(new Set([2, 1]))).toBe(stableStringify(new Set([1, 2]))); // order-independent
  });
  test("handles cycles", () => {
    const a: Record<string, unknown> = {}; a.self = a;
    expect(() => stableStringify(a)).not.toThrow();
    expect(stableStringify(a)).toContain("[cycle]");
  });
});
describe("fnv1a / hashValue", () => {
  test("fnv1a is deterministic, 8 hex chars, and differs on different input", () => {
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
    expect(fnv1a("abc")).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a("abc")).not.toBe(fnv1a("abd"));
  });
  test("hashValue is stable across key order and changes with value", () => {
    expect(hashValue({ a: 1, b: 2 })).toBe(hashValue({ b: 2, a: 1 }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });
});
