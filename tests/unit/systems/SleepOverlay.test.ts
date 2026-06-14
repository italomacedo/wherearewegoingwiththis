import { NullEngine, Scene } from '@babylonjs/core';
import { SleepOverlay } from '@systems/SleepOverlay';
import { resetLocale, setLocale } from '@systems/I18n';
import { SettingsService } from '@systems/SettingsService';

describe('SleepOverlay', () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
    SettingsService.reset();
    resetLocale();
  });

  describe('clockText (pure)', () => {
    it('formats the start hour at progress 0', () => {
      expect(SleepOverlay.clockText(20, 0)).toBe('20:00');
      expect(SleepOverlay.clockText(6.5, 0)).toBe('06:30');
    });

    it('advances 8 hours by progress 1, wrapping past midnight', () => {
      expect(SleepOverlay.clockText(20, 1)).toBe('04:00'); // 20 + 8 = 28 → 04:00
      expect(SleepOverlay.clockText(1, 1)).toBe('09:00');
    });

    it('interpolates partway through', () => {
      expect(SleepOverlay.clockText(0, 0.5)).toBe('04:00'); // half of 8h = 4h
    });

    it('clamps progress to [0,1]', () => {
      expect(SleepOverlay.clockText(20, -1)).toBe('20:00');
      expect(SleepOverlay.clockText(20, 5)).toBe('04:00');
    });
  });

  describe('state (headless)', () => {
    it('starts closed', () => {
      const ov = new SleepOverlay(scene);
      expect(ov.isOpen()).toBe(false);
    });

    it('play() opens and resolves immediately in Node, close() closes', async () => {
      const ov = new SleepOverlay(scene);
      await ov.play(20);
      expect(ov.isOpen()).toBe(true);
      ov.close();
      expect(ov.isOpen()).toBe(false);
    });

    it('dispose is safe with no GUI', () => {
      const ov = new SleepOverlay(scene);
      expect(() => ov.dispose()).not.toThrow();
    });

    it('clockText respects the active locale (numbers are locale-neutral)', () => {
      setLocale('pt-BR');
      expect(SleepOverlay.clockText(20, 1)).toBe('04:00');
    });
  });
});
