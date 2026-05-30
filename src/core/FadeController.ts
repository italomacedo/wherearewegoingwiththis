/**
 * Pure alpha animation controller.
 * Does not import @babylonjs/gui — callers inject an `applyAlpha` callback.
 * This makes it testable in Node.js without browser APIs.
 */
export class FadeController {
  private alphaValue: number;
  private readonly applyAlpha: (alpha: number) => void;

  constructor(applyAlpha: (alpha: number) => void, initialAlpha = 0) {
    this.alphaValue = initialAlpha;
    this.applyAlpha = applyAlpha;
    applyAlpha(initialAlpha);
  }

  get alpha(): number {
    return this.alphaValue;
  }

  /** Animate alpha to `to` over `durationMs`. Resolves when complete. */
  animate(to: number, durationMs: number): Promise<void> {
    if (durationMs <= 0) {
      this.alphaValue = to;
      this.applyAlpha(to);
      return Promise.resolve();
    }
    const from = this.alphaValue;
    return new Promise((resolve) => {
      const start = Date.now();
      const step = () => {
        const elapsed = Date.now() - start;
        const t = Math.min(elapsed / durationMs, 1);
        this.alphaValue = from + (to - from) * t;
        this.applyAlpha(this.alphaValue);
        if (t < 1) setTimeout(step, 16);
        else resolve();
      };
      setTimeout(step, 16);
    });
  }

  /** Fade to opaque (alpha → 1) */
  fadeOut(durationMs: number): Promise<void> {
    return this.animate(1, durationMs);
  }

  /** Fade to transparent (alpha → 0) */
  fadeIn(durationMs: number): Promise<void> {
    return this.animate(0, durationMs);
  }
}
