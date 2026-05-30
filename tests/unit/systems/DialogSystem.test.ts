import { NullEngine, Scene } from '@babylonjs/core';
import { DialogSystem } from '../../../src/systems/DialogSystem';

describe('DialogSystem', () => {
  let engine: NullEngine;
  let scene: Scene;
  let dialog: DialogSystem;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    dialog = new DialogSystem(scene);
  });

  afterEach(() => {
    dialog.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('starts closed', () => {
    expect(dialog.isOpen()).toBe(false);
    expect(dialog.getState().npcText).toBe('');
  });

  it('open sets open state and npc name', () => {
    dialog.open('Zara');
    expect(dialog.isOpen()).toBe(true);
    expect(dialog.getState().npcName).toBe('Zara');
  });

  it('open resets previous text', () => {
    dialog.open('Zara');
    dialog.appendChunk('hello');
    dialog.open('Zara');
    expect(dialog.getState().npcText).toBe('');
  });

  it('close resets state', () => {
    dialog.open('Zara');
    dialog.close();
    expect(dialog.isOpen()).toBe(false);
    expect(dialog.getState().npcName).toBe('');
  });

  it('setThinking toggles thinking flag', () => {
    dialog.open('Zara');
    dialog.setThinking(true);
    expect(dialog.getState().thinking).toBe(true);
  });

  it('appendChunk accumulates text and clears thinking', () => {
    dialog.open('Zara');
    dialog.setThinking(true);
    dialog.appendChunk('Hel');
    dialog.appendChunk('lo');
    expect(dialog.getState().npcText).toBe('Hello');
    expect(dialog.getState().thinking).toBe(false);
  });

  it('setNpcText replaces text', () => {
    dialog.open('Zara');
    dialog.appendChunk('old');
    dialog.setNpcText('new');
    expect(dialog.getState().npcText).toBe('new');
  });

  it('submit calls handler with trimmed message when open', () => {
    const handler = jest.fn();
    dialog.onSubmit(handler);
    dialog.open('Zara');
    dialog.submit('  hello  ');
    expect(handler).toHaveBeenCalledWith('hello');
  });

  it('submit does nothing when closed', () => {
    const handler = jest.fn();
    dialog.onSubmit(handler);
    dialog.submit('hello');
    expect(handler).not.toHaveBeenCalled();
  });

  it('submit ignores empty/whitespace messages', () => {
    const handler = jest.fn();
    dialog.onSubmit(handler);
    dialog.open('Zara');
    dialog.submit('   ');
    expect(handler).not.toHaveBeenCalled();
  });

  it('submit without handler does not throw', () => {
    dialog.open('Zara');
    expect(() => dialog.submit('hi')).not.toThrow();
  });

  it('getState returns an independent copy', () => {
    dialog.open('Zara');
    const s = dialog.getState();
    s.npcText = 'mutated';
    expect(dialog.getState().npcText).toBe('');
  });

  it('dispose clears the submit handler', () => {
    const handler = jest.fn();
    dialog.onSubmit(handler);
    dialog.dispose();
    dialog.open('Zara');
    dialog.submit('hi');
    expect(handler).not.toHaveBeenCalled();
  });
});
