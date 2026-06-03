import {
  SFX_CUES,
  sfxSpec,
  sfxForBeat,
  footstepInterval,
  type SfxCue,
} from '../../../src/systems/SfxCatalog';

describe('SfxCatalog', () => {
  it('every cue has a path under /assets/audio/sfx and a bus', () => {
    for (const [cue, spec] of Object.entries(SFX_CUES)) {
      expect(spec.path).toMatch(/^\/assets\/audio\/sfx\/.+\.ogg$/);
      expect(['master', 'music', 'sfx', 'voice']).toContain(spec.bus);
      expect(cue.length).toBeGreaterThan(0);
    }
  });

  it('the engine cue loops; the rest are one-shots', () => {
    expect(SFX_CUES.engine.loop).toBe(true);
    expect(SFX_CUES.gunshot.loop).toBeUndefined();
  });

  it('sfxSpec resolves known cues and rejects unknown', () => {
    expect(sfxSpec('gunshot')?.path).toContain('gunshot.ogg');
    expect(sfxSpec('does_not_exist')).toBeNull();
  });

  describe('sfxForBeat', () => {
    it('ranged hit → gunshot (no melee impact)', () => {
      expect(sfxForBeat({ kind: 'hit', attackKind: 'ranged' })).toEqual(['gunshot']);
    });

    it('unarmed melee hit → swing then punch', () => {
      expect(sfxForBeat({ kind: 'hit', attackKind: 'melee', weaponName: 'fists' })).toEqual(['swing', 'punch']);
      expect(sfxForBeat({ kind: 'hit', attackKind: 'melee', weaponName: 'punhos' })).toEqual(['swing', 'punch']);
    });

    it('armed melee hit → swing then stab', () => {
      expect(sfxForBeat({ kind: 'hit', attackKind: 'melee', weaponName: 'Knife' })).toEqual(['swing', 'stab']);
    });

    it('melee miss → swing only (no impact)', () => {
      expect(sfxForBeat({ kind: 'miss', attackKind: 'melee', weaponName: 'Knife' })).toEqual(['swing']);
    });

    it('melee death → swing, stab, bodyfall', () => {
      expect(sfxForBeat({ kind: 'death', attackKind: 'melee', weaponName: 'Knife' })).toEqual(['swing', 'stab', 'bodyfall']);
    });

    it('ranged death → gunshot then bodyfall (no melee impact)', () => {
      expect(sfxForBeat({ kind: 'death', attackKind: 'ranged' })).toEqual(['gunshot', 'bodyfall']);
    });

    it('non-attack or attackKind-less beats produce nothing', () => {
      expect(sfxForBeat({ kind: 'move' })).toEqual([]);
      expect(sfxForBeat({ kind: 'hit' })).toEqual([]); // no attackKind
    });
  });

  describe('footstepInterval', () => {
    it('walk is slower-cadence than run; idle/interact are silent', () => {
      expect(footstepInterval('walk')).toBeGreaterThan(footstepInterval('run'));
      expect(footstepInterval('run')).toBeGreaterThan(0);
      expect(footstepInterval('idle')).toBe(0);
      expect(footstepInterval('interact')).toBe(0);
    });
  });

  it('all SfxCue ids are present in the registry', () => {
    const cues: SfxCue[] = [
      'footstep', 'punch', 'stab', 'swing', 'gunshot', 'explosion',
      'bodyfall', 'engine', 'ui_click', 'ui_open', 'ui_error', 'eat', 'growl',
    ];
    for (const c of cues) expect(SFX_CUES[c]).toBeDefined();
  });
});
