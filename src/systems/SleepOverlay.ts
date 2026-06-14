import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Rectangle, TextBlock, Control,
} from '@babylonjs/gui';
import { t } from '@systems/I18n';
import { UI } from '@systems/UiStyle';
import { formatHour } from '@systems/GameClock';

/** Wall-clock duration of the accelerated-time animation (ms). */
export const SLEEP_ANIM_MS = 1800;

/**
 * SleepOverlay — the "sleeping" modal: a black scrim (fade to black) over a neon
 * card whose big clock spins forward 8 in-world hours, then fades back to the
 * world. Open/close state + the displayed-clock math are pure and tested; the
 * Babylon GUI + rAF animation are browser-only (istanbul-ignored).
 */
export class SleepOverlay {
  private scene: Scene;
  private open = false;

  // Browser GUI handles (null in Node/Jest).
  private gui: AdvancedDynamicTexture | null = null;
  private panel: Rectangle | null = null;
  private clockLabel: TextBlock | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.buildUI();
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Pure: the "HH:MM" the clock shows at `progress` (0..1) of an 8-hour sleep. */
  static clockText(startHour: number, progress: number): string {
    const p = Math.min(1, Math.max(0, progress));
    return formatHour(startHour + 8 * p);
  }

  /**
   * Run the sleep animation: fade to black, spin the clock from `startHour` to
   * +8h over `SLEEP_ANIM_MS`, and resolve. The caller then applies the sleep
   * effects and calls `close()` to fade back to the world. In Node/Jest (no
   * document) it resolves immediately so headless callers don't hang.
   */
  async play(startHour: number): Promise<void> {
    this.open = true;
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser-only animation */
    await this.playBrowser(startHour);
  }

  /**
   * Wake up: clears the open latch (unfreezing the world) and fades the black
   * scrim away over the live scene (fade-in). Headless: just hides instantly.
   */
  close(): void {
    this.open = false;
    if (typeof document === 'undefined') { return; }
    /* istanbul ignore next — browser GUI only */
    this.fadeOutScrim();
  }

  /* istanbul ignore next — browser-only fade-in animation */
  private fadeOutScrim(): void {
    const scrim = this.panel;
    if (!scrim) return;
    const hideLabel = this.clockLabel;
    if (hideLabel) hideLabel.text = '';
    const fadeMs = 400;
    const t0 = performance.now();
    const step = (now: number): void => {
      const e = now - t0;
      if (e >= fadeMs) { scrim.alpha = 0; scrim.isVisible = false; return; }
      scrim.alpha = 1 - e / fadeMs;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private buildUI(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    this.buildUIBrowser();
  }

  /* istanbul ignore next — browser GUI only */
  private buildUIBrowser(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('sleep-ui', true, this.scene);
    this.gui = gui;

    const scrim = new Rectangle('sleep-scrim');
    scrim.width = '100%'; scrim.height = '100%';
    scrim.background = 'rgba(0,0,0,1)'; scrim.thickness = 0;
    scrim.isVisible = false;
    scrim.alpha = 0;
    gui.addControl(scrim);
    this.panel = scrim;

    const frame = new Rectangle('sleep-frame');
    frame.width = '360px'; frame.height = '200px';
    frame.background = UI.frameBg; frame.color = UI.frameBorder;
    frame.thickness = 2; frame.cornerRadius = UI.cornerLg;
    scrim.addControl(frame);

    const header = new Rectangle('sleep-header');
    header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    header.height = UI.headerHeight;
    header.background = UI.headerBg; header.thickness = 0;
    frame.addControl(header);

    const accent = new Rectangle('sleep-accent');
    accent.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    accent.height = '2px'; accent.background = UI.accent; accent.thickness = 0;
    header.addControl(accent);

    const title = new TextBlock('sleep-title', t('sleep.title'));
    title.color = UI.accent;
    title.fontSize = UI.fontTitle;
    title.fontFamily = UI.font;
    title.fontStyle = 'bold';
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.left = '24px';
    header.addControl(title);

    const clock = new TextBlock('sleep-clock', '');
    clock.color = UI.textPrimary;
    clock.fontSize = 56;
    clock.fontFamily = UI.font;
    clock.fontStyle = 'bold';
    clock.top = '28px';
    clock.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    frame.addControl(clock);
    this.clockLabel = clock;
  }

  /* istanbul ignore next — browser-only rAF animation + fade */
  private playBrowser(startHour: number): Promise<void> {
    return new Promise((resolve) => {
      const scrim = this.panel;
      const clock = this.clockLabel;
      if (!scrim) { resolve(); return; }
      scrim.isVisible = true;
      scrim.alpha = 0;
      const fadeMs = 350;
      const total = fadeMs + SLEEP_ANIM_MS;
      const t0 = performance.now();
      const step = (now: number): void => {
        const e = now - t0;
        if (e < fadeMs) {
          // Phase 1: fade to black, clock parked at the start hour.
          scrim.alpha = e / fadeMs;
          if (clock) clock.text = SleepOverlay.clockText(startHour, 0);
        } else if (e < total) {
          // Phase 2: full black, clock spins forward 8 hours.
          scrim.alpha = 1;
          if (clock) clock.text = SleepOverlay.clockText(startHour, (e - fadeMs) / SLEEP_ANIM_MS);
        } else {
          if (clock) clock.text = SleepOverlay.clockText(startHour, 1);
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  dispose(): void {
    /* istanbul ignore next — browser GUI only */
    if (this.gui) {
      this.gui.dispose();
      this.gui = null;
      this.panel = null;
      this.clockLabel = null;
    }
  }
}
