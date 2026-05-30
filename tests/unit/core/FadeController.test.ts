import { FadeController } from '../../../src/core/FadeController';

describe('FadeController', () => {
  it('constructs with default alpha 0 and calls applyAlpha', () => {
    const applyAlpha = jest.fn();
    const fade = new FadeController(applyAlpha);
    expect(fade.alpha).toBe(0);
    expect(applyAlpha).toHaveBeenCalledWith(0);
  });

  it('constructs with custom initial alpha', () => {
    const applyAlpha = jest.fn();
    const fade = new FadeController(applyAlpha, 0.5);
    expect(fade.alpha).toBe(0.5);
    expect(applyAlpha).toHaveBeenCalledWith(0.5);
  });

  it('animate with 0 duration sets alpha immediately and calls applyAlpha', async () => {
    const applyAlpha = jest.fn();
    const fade = new FadeController(applyAlpha, 0);
    await fade.animate(1, 0);
    expect(fade.alpha).toBe(1);
    expect(applyAlpha).toHaveBeenLastCalledWith(1);
  });

  it('fadeOut with 0 duration sets alpha to 1', async () => {
    const applyAlpha = jest.fn();
    const fade = new FadeController(applyAlpha, 0);
    await fade.fadeOut(0);
    expect(fade.alpha).toBe(1);
  });

  it('fadeIn with 0 duration sets alpha to 0', async () => {
    const applyAlpha = jest.fn();
    const fade = new FadeController(applyAlpha, 1);
    await fade.fadeIn(0);
    expect(fade.alpha).toBe(0);
  });

  it('animate with duration > 0 completes and reaches target alpha', async () => {
    jest.useFakeTimers();
    const applyAlpha = jest.fn();
    const fade = new FadeController(applyAlpha, 0);

    const promise = fade.animate(1, 100);
    // Advance time past the 100ms duration
    jest.advanceTimersByTime(200);
    await promise;

    expect(fade.alpha).toBe(1);
    expect(applyAlpha).toHaveBeenLastCalledWith(1);
    jest.useRealTimers();
  });

  it('animate calls applyAlpha during intermediate steps', async () => {
    jest.useFakeTimers();
    const applyAlpha = jest.fn();
    const fade = new FadeController(applyAlpha, 0);

    const promise = fade.animate(1, 100);

    // Fire first step (16ms tick — alpha will be ~0.16 but < 1)
    jest.advanceTimersByTime(16);
    expect(applyAlpha).toHaveBeenCalledTimes(2); // constructor call + first step

    // Advance to completion
    jest.advanceTimersByTime(200);
    await promise;

    expect(fade.alpha).toBe(1);
    jest.useRealTimers();
  });

  it('animate step continues until t >= 1', async () => {
    jest.useFakeTimers();
    const applyAlpha = jest.fn();
    const fade = new FadeController(applyAlpha, 0);

    const promise = fade.animate(1, 48); // 3 × 16ms steps
    jest.advanceTimersByTime(200);
    await promise;

    // After completion, alpha must be exactly 1
    expect(fade.alpha).toBe(1);
    jest.useRealTimers();
  });
});
