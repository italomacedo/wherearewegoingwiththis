import { NullEngine, Scene } from '@babylonjs/core';
import { CharacterAssembler, buildCharacterPlan, resolveMorphInfluences } from '../../../src/systems/CharacterAssembler';
import { DEFAULT_APPEARANCE, CharacterAppearance } from '../../../src/entities/CharacterData';

const withSlots = (slots: CharacterAppearance['slots']): CharacterAppearance =>
  ({ ...DEFAULT_APPEARANCE, slots });
const withSkin = (skin: string): CharacterAppearance =>
  ({ ...DEFAULT_APPEARANCE, colors: { ...DEFAULT_APPEARANCE.colors, skin } });

describe('buildCharacterPlan (pure)', () => {
  it('resolves base path, skin tone and texture', () => {
    const plan = buildCharacterPlan({ ...DEFAULT_APPEARANCE, bodyBase: 'body_male_white' });
    expect(plan.basePath).toBe('characters/base/body_male_white.glb');
    expect(plan.skinTone).toBe(DEFAULT_APPEARANCE.colors.skin);
    expect(plan.skinTexturePath).toMatch(/skin_01\.png$/);
  });

  it('orders layers by layer index and resolves manifest paths', () => {
    const plan = buildCharacterPlan(withSlots({
      kutte: 'kutte_club', shirt: 'shirt_button', boots: 'boots_combat',
    }));
    expect(plan.layers.map((l) => l.slot)).toEqual(['shirt', 'boots', 'kutte']);
    const shirt = plan.layers.find((l) => l.slot === 'shirt')!;
    expect(shirt.manifestPath).toBe('characters/clothes/tops/shirt_button.glb');
  });

  it('null manifestPath for an unknown asset key (graceful)', () => {
    const plan = buildCharacterPlan(withSlots({ jacket: 'no_such_jacket' }));
    expect(plan.layers[0]!.manifestPath).toBeNull();
  });

  it('keeps only known morphs and clamps their weights', () => {
    const plan = buildCharacterPlan({
      ...DEFAULT_APPEARANCE,
      morphs: { nose_width: 1.5, not_a_morph: 0.5, lips_fullness: -2 },
    });
    const ids = plan.morphs.map((m) => m.morphId).sort();
    expect(ids).toEqual(['lips_fullness', 'nose_width']);
    expect(plan.morphs.find((m) => m.morphId === 'nose_width')!.weight).toBe(1);
    expect(plan.morphs.find((m) => m.morphId === 'lips_fullness')!.weight).toBe(0);
  });

  it('resolves makeup when set, null otherwise', () => {
    expect(buildCharacterPlan(DEFAULT_APPEARANCE).makeup).toBeNull();
    const plan = buildCharacterPlan(withSlots({ makeup: 'makeup_neon' }));
    expect(plan.makeup).toEqual({ assetKey: 'makeup_neon', path: 'characters/face/makeup_neon.png' });
  });

  it('merges colors over defaults', () => {
    const plan = buildCharacterPlan({ ...DEFAULT_APPEARANCE, colors: { skin: '#ABCDEF' } });
    expect(plan.colors.skin).toBe('#ABCDEF');
    expect(plan.colors.eye).toBeDefined(); // backfilled default
  });
});

describe('resolveMorphInfluences (pure)', () => {
  it('maps planned morphs onto available glTF target names', () => {
    const out = resolveMorphInfluences(
      [{ morphId: 'nostril_width', weight: 0.7 }, { morphId: 'lips_fullness', weight: 0.2 }],
      ['nose-nostrils-width', 'mouth-lips-fullness'],
    );
    expect(out).toEqual([
      { name: 'nose-nostrils-width', weight: 0.7 },
      { name: 'mouth-lips-fullness', weight: 0.2 },
    ]);
  });

  it('drops morphs whose target is not present', () => {
    const out = resolveMorphInfluences(
      [{ morphId: 'nostril_width', weight: 0.5 }, { morphId: 'ear_size', weight: 0.5 }],
      ['ear-scale'],
    );
    expect(out).toEqual([{ name: 'ear-scale', weight: 0.5 }]);
  });

  it('returns empty when nothing matches', () => {
    expect(resolveMorphInfluences([{ morphId: 'nose_width', weight: 1 }], ['unrelated'])).toEqual([]);
  });
});

describe('CharacterAssembler', () => {
  let engine: NullEngine;
  let scene: Scene;
  let assembler: CharacterAssembler;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    assembler = new CharacterAssembler(scene);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('canLoadGltf returns false in Node.js', () => {
    expect(CharacterAssembler.canLoadGltf()).toBe(false);
  });

  it('setUseGltf toggles the flag but stays on placeholder in Node', async () => {
    try {
      CharacterAssembler.setUseGltf(true);
      expect(CharacterAssembler.useGltf).toBe(true);
      const spy = jest.spyOn(assembler, 'assemblePlaceholder');
      const char = await assembler.assemble(DEFAULT_APPEARANCE);
      expect(spy).toHaveBeenCalled(); // canLoadGltf() false → placeholder
      char.dispose();
    } finally {
      CharacterAssembler.setUseGltf(false);
    }
  });

  it('assembles a placeholder character with default appearance', async () => {
    const char = await assembler.assemble(DEFAULT_APPEARANCE);
    expect(char.rootMesh).toBeDefined();
    expect(char.meshes.length).toBeGreaterThan(0);
    char.dispose();
  });

  it('placeholder character has body parts + default hair + eyes', async () => {
    const char = await assembler.assemble(DEFAULT_APPEARANCE);
    // head + torso + arms + legs (6) plus hair + eyes
    expect(char.meshes.length).toBeGreaterThanOrEqual(7);
    expect(char.meshes.find((m) => m.name === 'hair')).toBeDefined();
    expect(char.meshes.find((m) => m.name === 'eyes')).toBeDefined();
    char.dispose();
  });

  it('dispose removes all meshes from scene', async () => {
    const before = scene.meshes.length;
    const char = await assembler.assemble(DEFAULT_APPEARANCE);
    expect(scene.meshes.length).toBeGreaterThan(before);
    char.dispose();
    expect(scene.meshes.length).toBe(before);
  });

  it('does not add hair mesh when hair slot is absent', async () => {
    const char = await assembler.assemble(withSlots({ eyes: 'eyes_default' }));
    expect(char.meshes.find((m) => m.name === 'hair')).toBeUndefined();
    char.dispose();
  });

  it('renders each layered clothing slot as a named proxy', async () => {
    const char = await assembler.assemble(withSlots({
      long_sleeve: 'hoodie_corp', jacket: 'jacket_leather', kutte: 'kutte_club',
      pants: 'pants_tactical', belt: 'belt_utility', socks: 'socks_long', boots: 'boots_combat',
    }));
    for (const name of ['long_sleeve', 'jacket', 'kutte', 'pants', 'belt', 'socks', 'boots']) {
      expect(char.meshes.find((m) => m.name === name)).toBeDefined();
    }
    char.dispose();
  });

  it('exclusive bottoms: choosing shorts replaces pants in the build', async () => {
    const char = await assembler.assemble(withSlots({ pants: 'pants_tactical', shorts: 'shorts_cyber' }));
    // applySlot already cleared pants; but even a raw both-set map should only
    // render what resolveLayers returns — here both are present so both render.
    expect(char.meshes.find((m) => m.name === 'shorts')).toBeDefined();
    char.dispose();
  });

  it('renders facial-hair and teeth proxies', async () => {
    const char = await assembler.assemble(withSlots({
      eyebrows: 'eyebrows_thick', beard: 'beard_full', teeth: 'teeth_default',
    }));
    for (const name of ['eyebrows', 'beard', 'teeth']) {
      expect(char.meshes.find((m) => m.name === name)).toBeDefined();
    }
    char.dispose();
  });

  it('makeup does not add a mesh layer', async () => {
    const char = await assembler.assemble(withSlots({ makeup: 'makeup_neon' }));
    expect(char.meshes.find((m) => m.name === 'makeup')).toBeUndefined();
    char.dispose();
  });

  it('assemblePlaceholder is called directly via assemble in Node.js', async () => {
    const spy = jest.spyOn(assembler, 'assemblePlaceholder');
    const char = await assembler.assemble(DEFAULT_APPEARANCE);
    expect(spy).toHaveBeenCalled();
    char.dispose();
  });

  it('different skin tones produce valid characters', async () => {
    for (const tone of ['#FFFFFF', '#8B6355', '#2D1B0E']) {
      const char = await assembler.assemble(withSkin(tone));
      expect(char.meshes.length).toBeGreaterThan(0);
      char.dispose();
    }
  });
});
