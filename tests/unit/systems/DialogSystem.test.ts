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

  it('setNpcName updates the speaker name', () => {
    dialog.open('Unknown');
    dialog.setNpcName('Zara');
    expect(dialog.getState().npcName).toBe('Zara');
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

  it('input is not focused by default', () => {
    expect(dialog.isInputFocused()).toBe(false);
  });

  it('close resets the input-focused flag', () => {
    dialog.open('Zara');
    dialog.close();
    expect(dialog.isInputFocused()).toBe(false);
  });

  it('dispose clears the submit handler', () => {
    const handler = jest.fn();
    dialog.onSubmit(handler);
    dialog.dispose();
    dialog.open('Zara');
    dialog.submit('hi');
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── Conversation history ──────────────────────────────────────────────────

  it('records player and NPC lines in order', () => {
    dialog.open('Zara');
    dialog.addPlayerLine('got chips?');
    dialog.appendChunk('Maybe.');
    const lines = dialog.getState().lines;
    expect(lines).toEqual([
      { role: 'player', text: 'got chips?' },
      { role: 'npc', text: 'Maybe.' },
    ]);
  });

  it('appendChunk after a player line starts a new NPC line', () => {
    dialog.open('Zara');
    dialog.addPlayerLine('hi');
    dialog.appendChunk('Yo');
    dialog.addPlayerLine('you ok?');
    dialog.appendChunk('Fine.');
    expect(dialog.getState().lines).toHaveLength(4);
    expect(dialog.getState().npcText).toBe('Fine.');
  });

  it('open seeds prior conversation lines', () => {
    dialog.open('Zara', [
      { role: 'player', text: 'hey' },
      { role: 'npc', text: 'what.' },
    ]);
    expect(dialog.getState().lines).toHaveLength(2);
    expect(dialog.getState().npcText).toBe('what.');
  });

  it('getState lines are an independent copy', () => {
    dialog.open('Zara');
    dialog.addPlayerLine('hi');
    const lines = dialog.getState().lines;
    lines[0]!.text = 'mutated';
    lines.push({ role: 'npc', text: 'x' });
    expect(dialog.getState().lines).toEqual([{ role: 'player', text: 'hi' }]);
  });

  // ─── Segment parsing (emote vs speech) ─────────────────────────────────────

  it('parseSegments returns plain speech as a single speech segment', () => {
    expect(DialogSystem.parseSegments('Just words.')).toEqual([
      { kind: 'speech', text: 'Just words.' },
    ]);
  });

  it('parseSegments extracts *emotes* and keeps order', () => {
    const segs = DialogSystem.parseSegments('*she looks up* "Oi." *back to the chips*');
    expect(segs).toEqual([
      { kind: 'emote', text: 'she looks up' },
      { kind: 'speech', text: '"Oi."' },
      { kind: 'emote', text: 'back to the chips' },
    ]);
  });

  it('parseSegments handles an emote-only line', () => {
    expect(DialogSystem.parseSegments('*shrugs*')).toEqual([
      { kind: 'emote', text: 'shrugs' },
    ]);
  });

  it('parseSegments returns nothing for empty/whitespace text', () => {
    expect(DialogSystem.parseSegments('')).toEqual([]);
    expect(DialogSystem.parseSegments('   ')).toEqual([]);
  });
});
