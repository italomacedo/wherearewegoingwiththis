import { ServiceLocator } from '@core/ServiceLocator';
import type { AudioManager } from './AudioManager';

/**
 * Fire a UI/feedback SFX cue through the registered AudioManager, if present.
 * Safe no-op when no audio service is registered (tests/headless) — lets any
 * scene play `ui_click`/`ui_open`/`ui_error` without holding an AudioManager ref.
 */
export function playSfxCue(cue: string): void {
  ServiceLocator.tryGet<AudioManager>('audio')?.playCue(cue);
}
