/**
 * SeededRng — deterministic PRNG for procedural tile generation (Fase 17).
 *
 * Mirrors the injected-`rng` pattern already used across the codebase
 * (`RollFn = () => number in [0,1)` from `SkillCheck`): generators take a
 * `RollFn`, and a seeded `mulberry32` is just one concrete `RollFn`. Drawing in
 * a FIXED order from `mulberry32(tileSeed(worldSeed,tx,tz))` makes a tile's
 * layout identical forever for the same inputs — the linchpin of storing only
 * mutable deltas (never the layout) in the save.
 *
 * No Babylon, no DOM, no global state — 100% unit-testable.
 */

import type { RollFn } from '@systems/SkillCheck';

/**
 * 32-bit integer mixer (xmur3-style) over the args → an unsigned seed.
 * Stable, order-sensitive, well-distributed for small int inputs (seed/tx/tz).
 */
export function hash32(...nums: number[]): number {
  let h = 1779033703 ^ nums.length;
  for (const n of nums) {
    h = Math.imul(h ^ (n | 0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deterministic per-tile seed from the world seed + tile coordinates. */
export function tileSeed(worldSeed: number, tx: number, tz: number): number {
  return hash32(worldSeed, tx, tz);
}

/** Classic mulberry32 PRNG → a `RollFn` returning [0,1). */
export function mulberry32(seed: number): RollFn {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A `RollFn` seeded for tile (tx,tz) under `worldSeed`. */
export function tileRng(worldSeed: number, tx: number, tz: number): RollFn {
  return mulberry32(tileSeed(worldSeed, tx, tz));
}

/** Pick one element of a non-empty array. */
export function pick<T>(rng: RollFn, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Uniform float in [lo, hi). */
export function range(rng: RollFn, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/** Uniform integer in [lo, hi] (inclusive). */
export function intRange(rng: RollFn, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Fisher–Yates shuffle into a NEW array (input untouched). */
export function shuffle<T>(rng: RollFn, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Weighted pick by `weight` (non-positive weights ignored). */
export function weightedPick<T extends { weight: number }>(rng: RollFn, entries: readonly T[]): T {
  const total = entries.reduce((s, e) => s + Math.max(0, e.weight), 0);
  if (total <= 0) return entries[0];
  let r = rng() * total;
  for (const e of entries) {
    r -= Math.max(0, e.weight);
    if (r < 0) return e;
  }
  /* istanbul ignore next -- defensive float fallthrough (rng()<1 always crosses zero) */
  return entries[entries.length - 1];
}
