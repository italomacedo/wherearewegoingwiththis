import { downsampleBars, idleBars } from '@systems/audio/Waveform';

describe('downsampleBars', () => {
  it('returns the requested number of bars', () => {
    expect(downsampleBars(new Uint8Array(64), 16)).toHaveLength(16);
    expect(downsampleBars(new Uint8Array(64), 1)).toHaveLength(1);
  });

  it('normalizes bytes (0..255) to 0..1', () => {
    const flat = new Uint8Array(32).fill(255);
    expect(downsampleBars(flat, 4)).toEqual([1, 1, 1, 1]);
    const half = new Uint8Array(32).fill(128);
    downsampleBars(half, 4).forEach((v) => expect(v).toBeCloseTo(128 / 255, 5));
  });

  it('averages each contiguous band of bins', () => {
    // 4 bins → 2 bars: [0,255 | 255,0] → each band averages to 0.5.
    const freq = new Uint8Array([0, 255, 255, 0]);
    const bars = downsampleBars(freq, 2);
    expect(bars[0]).toBeCloseTo(0.5, 5);
    expect(bars[1]).toBeCloseTo(0.5, 5);
  });

  it('handles more bars than bins (empty bands rest at 0)', () => {
    const freq = new Uint8Array([255, 255]);
    const bars = downsampleBars(freq, 4);
    expect(bars).toHaveLength(4);
    // Some bands map to a single hot bin, others to none → 0.
    expect(Math.max(...bars)).toBe(1);
    expect(Math.min(...bars)).toBe(0);
  });

  it('is defensive: empty input → all zeros; zero/neg bars → empty', () => {
    expect(downsampleBars(new Uint8Array(0), 3)).toEqual([0, 0, 0]);
    expect(downsampleBars([10, 20, 30], 0)).toEqual([]);
    expect(downsampleBars([10, 20, 30], -2)).toEqual([]);
  });

  it('accepts a plain number[] too', () => {
    expect(downsampleBars([255, 255, 255, 255], 2)).toEqual([1, 1]);
  });
});

describe('idleBars', () => {
  it('fills a flat resting level', () => {
    expect(idleBars(3)).toEqual([0.04, 0.04, 0.04]);
    expect(idleBars(2, 0.1)).toEqual([0.1, 0.1]);
    expect(idleBars(0)).toEqual([]);
  });
});
