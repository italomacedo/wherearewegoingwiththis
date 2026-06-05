import { NullEngine, Scene } from '@babylonjs/core';
import { PdaOverlay } from '../../../src/systems/PdaOverlay';
import { PdaEntry } from '../../../src/systems/pda/Pda';
import { ServiceLocator } from '../../../src/core/ServiceLocator';

let engine: InstanceType<typeof NullEngine>;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});

afterEach(() => {
  ServiceLocator.clear();
  scene.dispose();
  engine.dispose();
});

const entries: PdaEntry[] = [{ subjectId: 'a', subjectName: 'Ana', lines: ['Role: vendor'] }];

describe('PdaOverlay — state machine (headless)', () => {
  it('starts closed', () => {
    expect(new PdaOverlay(scene).isOpen()).toBe(false);
  });

  it('show() opens; hide() closes and calls onClose', () => {
    const overlay = new PdaOverlay(scene);
    const onClose = jest.fn();
    overlay.setHandlers({ onClose });
    overlay.show(entries);
    expect(overlay.isOpen()).toBe(true);
    overlay.hide();
    expect(overlay.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('show() while open is a no-op; hide() while closed is a no-op', () => {
    const overlay = new PdaOverlay(scene);
    const onClose = jest.fn();
    overlay.setHandlers({ onClose });
    overlay.hide(); // closed → no-op
    overlay.show(entries);
    overlay.show(entries); // ignored
    overlay.hide();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dispose() closes without throwing', () => {
    const overlay = new PdaOverlay(scene);
    overlay.show(entries);
    overlay.dispose();
    expect(overlay.isOpen()).toBe(false);
  });
});
