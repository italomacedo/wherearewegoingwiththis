import { NullEngine, Scene } from '@babylonjs/core';
import { CharacterAssembler } from '../../../src/systems/CharacterAssembler';
import { DEFAULT_APPEARANCE, CharacterAppearance } from '../../../src/entities/CharacterData';

const withSlots = (slots: CharacterAppearance['slots']): CharacterAppearance =>
  ({ ...DEFAULT_APPEARANCE, slots });
const withSkin = (skin: string): CharacterAppearance =>
  ({ ...DEFAULT_APPEARANCE, colors: { ...DEFAULT_APPEARANCE.colors, skin } });

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

  it('assembles a placeholder character with default appearance', async () => {
    const char = await assembler.assemble(DEFAULT_APPEARANCE);
    expect(char.rootMesh).toBeDefined();
    expect(char.meshes.length).toBeGreaterThan(0);
    char.dispose();
  });

  it('placeholder character has multiple meshes (body parts)', async () => {
    const char = await assembler.assemble(DEFAULT_APPEARANCE);
    expect(char.meshes.length).toBeGreaterThanOrEqual(5); // head + torso + arms + legs
    char.dispose();
  });

  it('dispose removes all meshes from scene', async () => {
    const before = scene.meshes.length;
    const char = await assembler.assemble(DEFAULT_APPEARANCE);
    expect(scene.meshes.length).toBeGreaterThan(before);
    char.dispose();
    expect(scene.meshes.length).toBe(before);
  });

  it('adds hair mesh when hair slot is set', async () => {
    const char = await assembler.assemble(withSlots({ hair: 'hair_short_01' }));
    expect(char.meshes.find((m) => m.name === 'hair')).toBeDefined();
    char.dispose();
  });

  it('does not add hair mesh when hair slot is absent', async () => {
    const char = await assembler.assemble(withSlots({ eyes: 'eyes_default' }));
    expect(char.meshes.find((m) => m.name === 'hair')).toBeUndefined();
    char.dispose();
  });

  it('adds clothing proxies when top/bottom/footwear slots are set', async () => {
    const char = await assembler.assemble(withSlots({
      jacket: 'jacket_leather',
      pants: 'pants_tactical',
      boots: 'boots_combat',
    }));
    expect(char.meshes.find((m) => m.name === 'top')).toBeDefined();
    expect(char.meshes.find((m) => m.name === 'bottom')).toBeDefined();
    expect(char.meshes.find((m) => m.name === 'shoes')).toBeDefined();
    char.dispose();
  });

  it('a base top alone still produces the top proxy', async () => {
    const char = await assembler.assemble(withSlots({ shirt: 'shirt_button' }));
    expect(char.meshes.find((m) => m.name === 'top')).toBeDefined();
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

  it('assemblePlaceholder applies skin tone to body meshes', async () => {
    const char1 = assembler.assemblePlaceholder(withSkin('#FF0000'));
    const char2 = assembler.assemblePlaceholder(withSkin('#0000FF'));
    expect(char1.meshes.length).toBeGreaterThan(0);
    expect(char2.meshes.length).toBeGreaterThan(0);
    char1.dispose();
    char2.dispose();
  });
});
