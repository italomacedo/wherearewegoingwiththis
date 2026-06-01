import {
  detectTone, resolveAddressee, stripShout, AddressCandidate, NORMAL_SPEAK_RANGE,
} from '../../../../src/systems/npc/Addressing';

const zara = (over: Partial<AddressCandidate> = {}): AddressCandidate => ({
  id: 'zara', name: 'Zara', nameKnown: false, position: { x: 0, z: 6 }, ...over,
});
const mae = (over: Partial<AddressCandidate> = {}): AddressCandidate => ({
  id: 'mae', name: 'Mae', nameKnown: true, position: { x: 0, z: -6 }, ...over,
});

// Player at origin facing +Z (yaw 0).
const player = (over: Partial<{ x: number; z: number; facingYaw: number }> = {}) => ({
  x: 0, z: 0, facingYaw: 0, ...over,
});

describe('Addressing — global chat resolver (pure)', () => {
  describe('detectTone', () => {
    it('treats *shout* / *grito* as a shout, anything else as normal', () => {
      expect(detectTone('*shout* hey you')).toBe('shout');
      expect(detectTone('*grito* ei você')).toBe('shout');
      expect(detectTone('hello there')).toBe('normal');
      expect(detectTone('*waves* hi')).toBe('normal');
    });
  });

  describe('stripShout', () => {
    it('removes the shout marker (a tone directive, not content)', () => {
      expect(stripShout('*shout* Zara! Can you hear me?')).toBe('Zara! Can you hear me?');
      expect(stripShout('*grito* ei!')).toBe('ei!');
    });
    it('leaves real action emotes intact', () => {
      expect(stripShout('*waves* hello')).toBe('*waves* hello');
      expect(stripShout('just talking')).toBe('just talking');
    });
  });

  describe('resolveAddressee', () => {
    it('routes to a known NPC named in the message (within reach)', () => {
      const r = resolveAddressee('hey Mae, got a sec?', player(), [zara(), mae()]);
      expect(r).toEqual({ kind: 'npc', id: 'mae', tone: 'normal' });
    });

    it('ignores a name the player does not yet know (falls through to aim)', () => {
      // Zara unknown; message says "Zara" but she is being faced anyway (+Z).
      const r = resolveAddressee('Zara?', player(), [zara({ nameKnown: false })]);
      expect(r).toEqual({ kind: 'npc', id: 'zara', tone: 'normal' });
    });

    it('uses aim when no name matches — picks the NPC the player faces', () => {
      const r = resolveAddressee('what are you selling?', player(), [zara(), mae()]);
      // facing +Z → Zara (at +Z), not Mae (behind at -Z)
      expect(r.kind).toBe('npc');
      expect(r.kind === 'npc' && r.id).toBe('zara');
    });

    it('falls back to ambient when nobody is named or faced', () => {
      // Only a candidate behind the player → not in the facing cone.
      const r = resolveAddressee('anyone around?', player(), [zara({ position: { x: 0, z: -6 } })]);
      expect(r).toEqual({ kind: 'ambient', tone: 'normal' });
    });

    it('ambient when there are no candidates at all', () => {
      expect(resolveAddressee('hello?', player(), [])).toEqual({ kind: 'ambient', tone: 'normal' });
    });

    it('normal speech does not reach a far NPC (out of range → ambient)', () => {
      const far = zara({ position: { x: 0, z: NORMAL_SPEAK_RANGE + 10 } });
      expect(resolveAddressee('hey', player(), [far]).kind).toBe('ambient');
    });

    it('a shout reaches across the whole scene', () => {
      const far = zara({ position: { x: 0, z: NORMAL_SPEAK_RANGE + 10 } });
      const r = resolveAddressee('*shout* HEY!', player(), [far]);
      expect(r).toEqual({ kind: 'npc', id: 'zara', tone: 'shout' });
    });

    it('aim picks the most-centered NPC, tie-broken by distance', () => {
      const near = zara({ id: 'near', position: { x: 0, z: 4 } });
      const farther = zara({ id: 'far', position: { x: 0, z: 10 } });
      const r = resolveAddressee('hi', player(), [farther, near]);
      expect(r.kind === 'npc' && r.id).toBe('near'); // same heading, nearer wins
    });
  });
});
