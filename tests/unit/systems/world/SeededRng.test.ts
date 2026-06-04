import {
  hash32, tileSeed, mulberry32, tileRng,
  pick, range, intRange, shuffle, weightedPick,
} from '@systems/world/SeededRng';

describe('SeededRng (pure)', () => {
  describe('hash32 / tileSeed', () => {
    it('is deterministic and order-sensitive', () => {
      expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
      expect(hash32(1, 2, 3)).not.toBe(hash32(3, 2, 1));
    });
    it('returns an unsigned 32-bit integer', () => {
      const h = hash32(123456, 7, 8);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
      expect(Number.isInteger(h)).toBe(true);
    });
    it('tileSeed differs per tile', () => {
      expect(tileSeed(42, 0, 0)).not.toBe(tileSeed(42, 1, 0));
      expect(tileSeed(42, 1, 0)).not.toBe(tileSeed(42, 0, 1));
      expect(tileSeed(42, 3, 5)).toBe(tileSeed(42, 3, 5));
    });
  });

  describe('mulberry32', () => {
    it('same seed → same sequence; different seed → different', () => {
      const a = mulberry32(99);
      const b = mulberry32(99);
      const c = mulberry32(100);
      const seqA = [a(), a(), a()];
      const seqB = [b(), b(), b()];
      const seqC = [c(), c(), c()];
      expect(seqA).toEqual(seqB);
      expect(seqA).not.toEqual(seqC);
    });
    it('produces values in [0,1)', () => {
      const r = mulberry32(7);
      for (let i = 0; i < 1000; i++) {
        const v = r();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
    it('tileRng wraps mulberry32(tileSeed)', () => {
      const direct = mulberry32(tileSeed(1, 2, 3));
      const viaTile = tileRng(1, 2, 3);
      expect([viaTile(), viaTile()]).toEqual([direct(), direct()]);
    });
  });

  describe('helpers', () => {
    it('pick selects within the array and is deterministic', () => {
      const arr = ['a', 'b', 'c', 'd'];
      const r = mulberry32(5);
      const picks = [pick(r, arr), pick(r, arr), pick(r, arr)];
      expect(picks.every((p) => arr.includes(p))).toBe(true);
      const r2 = mulberry32(5);
      expect([pick(r2, arr), pick(r2, arr), pick(r2, arr)]).toEqual(picks);
    });

    it('range stays in [lo,hi); intRange is inclusive', () => {
      const r = mulberry32(11);
      for (let i = 0; i < 500; i++) {
        const f = range(r, 2, 5);
        expect(f).toBeGreaterThanOrEqual(2);
        expect(f).toBeLessThan(5);
        const n = intRange(r, 1, 3);
        expect([1, 2, 3]).toContain(n);
      }
    });

    it('intRange single value collapses to that value', () => {
      const r = mulberry32(1);
      expect(intRange(r, 4, 4)).toBe(4);
    });

    it('shuffle returns a permutation without mutating input', () => {
      const arr = [1, 2, 3, 4, 5];
      const copy = arr.slice();
      const out = shuffle(mulberry32(3), arr);
      expect(arr).toEqual(copy); // untouched
      expect(out.slice().sort()).toEqual(copy);
    });

    it('weightedPick honors weights and skips zero-weight entries', () => {
      const entries = [
        { id: 'never', weight: 0 },
        { id: 'always', weight: 10 },
      ];
      const r = mulberry32(8);
      for (let i = 0; i < 200; i++) {
        expect(weightedPick(r, entries).id).toBe('always');
      }
    });

    it('weightedPick with all-zero weights falls back to the first entry', () => {
      const entries = [{ id: 'a', weight: 0 }, { id: 'b', weight: 0 }];
      expect(weightedPick(mulberry32(2), entries).id).toBe('a');
    });

    it('weightedPick distributes across positive weights', () => {
      const entries = [{ id: 'x', weight: 1 }, { id: 'y', weight: 1 }];
      const r = mulberry32(123);
      const seen = new Set<string>();
      for (let i = 0; i < 50; i++) seen.add(weightedPick(r, entries).id);
      expect(seen.has('x')).toBe(true);
      expect(seen.has('y')).toBe(true);
    });
  });
});
