import { parseIntent } from '@systems/npc/Intent';
import { PromptBuilder } from '@systems/npc/PromptBuilder';
import { IntentPromptInputs } from '@systems/npc/Intent';

const TARGETS = ['npc_mback', 'npc_vex'];

describe('parseIntent', () => {
  it('parses a stay intent', () => {
    expect(parseIntent('INTENT=stay\nTARGET=none', TARGETS, true)).toEqual({ kind: 'stay' });
  });

  it('parses approach with a valid target', () => {
    expect(parseIntent('INTENT=approach\nTARGET=npc_mback', TARGETS, true)).toEqual({
      kind: 'approach',
      targetNpcId: 'npc_mback',
    });
  });

  it('parses attack with a valid target', () => {
    expect(parseIntent('INTENT=attack\nTARGET=npc_vex', TARGETS, true)).toEqual({
      kind: 'attack',
      targetNpcId: 'npc_vex',
    });
  });

  it('degrades approach/attack to stay when the target is unknown or absent', () => {
    expect(parseIntent('INTENT=approach\nTARGET=ghost', TARGETS, true)).toEqual({ kind: 'stay' });
    expect(parseIntent('INTENT=attack\nTARGET=none', TARGETS, true)).toEqual({ kind: 'stay' });
  });

  it('parses react_to_player only when the player is present', () => {
    expect(parseIntent('INTENT=react_to_player', TARGETS, true)).toEqual({ kind: 'react_to_player' });
    expect(parseIntent('INTENT=react_to_player', TARGETS, false)).toEqual({ kind: 'stay' });
  });

  it('is case-insensitive and tolerant of extra prose', () => {
    expect(parseIntent('blah\nintent = APPROACH\ntarget = npc_mback\nok', TARGETS, true)).toEqual({
      kind: 'approach',
      targetNpcId: 'npc_mback',
    });
  });

  it('falls back to stay for garbage / unknown intents', () => {
    expect(parseIntent('INTENT=teleport', TARGETS, true)).toEqual({ kind: 'stay' });
    expect(parseIntent('', TARGETS, true)).toEqual({ kind: 'stay' });
  });
});

describe('PromptBuilder.buildIntentPrompt', () => {
  const base: IntentPromptInputs = {
    selfName: 'Zara',
    role: 'vendor',
    mood: 'suspicious',
    disposition: 'wary',
    gameTime: '23:00 (night)',
    nearbyNpcs: [{ id: 'npc_mback', name: 'Old Mback' }],
    playerPresent: true,
  };

  it('lists the constrained menu, nearby ids, disposition and time', () => {
    const p = PromptBuilder.buildIntentPrompt(base);
    expect(p).toContain('INTENT=stay or approach or attack or react_to_player');
    expect(p).toContain('TARGET=');
    expect(p).toContain('npc_mback');
    expect(p).toContain('Old Mback');
    expect(p).toContain('wary');
    expect(p).toContain('23:00 (night)');
    expect(p).toContain('present in the scene');
  });

  it('states when no one is nearby and when the player is absent', () => {
    const p = PromptBuilder.buildIntentPrompt({ ...base, nearbyNpcs: [], playerPresent: false });
    expect(p).toContain('No one else is nearby');
    expect(p).toContain('NOT here right now');
  });
});
