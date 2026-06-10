/**
 * Pure waveform helpers for the cockpit display. The browser samples the TTS
 * AnalyserNode (frequency bytes 0..255) each frame while Roxane speaks; this
 * reduces that raw spectrum to a handful of normalized bar heights (0..1) the
 * GUI renders as a row of vertical bars. Fully testable — no DOM / Web Audio.
 */

/**
 * Reduce a raw frequency-byte buffer (each 0..255) to `bars` averaged bands,
 * normalized to 0..1. Bins are split into contiguous, near-equal groups; a band
 * with no bins (more bars than bins) yields 0. Defensive against empty input.
 */
export function downsampleBars(freq: Uint8Array | number[], bars: number): number[] {
  const n = Math.max(0, Math.floor(bars));
  if (n === 0) return [];
  const out = new Array<number>(n).fill(0);
  const len = freq.length;
  if (len === 0) return out;
  for (let i = 0; i < n; i++) {
    const start = Math.floor((i * len) / n);
    const end = Math.floor(((i + 1) * len) / n);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += freq[j]!;
      count++;
    }
    out[i] = count > 0 ? sum / count / 255 : 0;
  }
  return out;
}

/** A flat row of `bars` resting levels (the idle waveform when no one speaks). */
export function idleBars(bars: number, level = 0.04): number[] {
  const n = Math.max(0, Math.floor(bars));
  return new Array<number>(n).fill(level);
}
