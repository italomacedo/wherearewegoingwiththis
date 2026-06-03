import { playSfxCue } from '../../../src/systems/UiSound';
import { ServiceLocator } from '../../../src/core/ServiceLocator';

describe('UiSound.playSfxCue', () => {
  afterEach(() => ServiceLocator.clear());

  it('forwards the cue to the registered AudioManager', () => {
    const playCue = jest.fn();
    ServiceLocator.register('audio', { playCue });
    playSfxCue('ui_click');
    expect(playCue).toHaveBeenCalledWith('ui_click');
  });

  it('is a safe no-op when no audio service is registered', () => {
    expect(() => playSfxCue('ui_error')).not.toThrow();
  });
});
