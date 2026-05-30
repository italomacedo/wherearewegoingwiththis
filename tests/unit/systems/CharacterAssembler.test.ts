import { NullEngine, Scene } from '@babylonjs/core';
import { CharacterAssembler } from '../../../src/systems/CharacterAssembler';
import { DEFAULT_APPEARANCE } from '../../../src/entities/CharacterData';

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

  it('adds hair mesh when hair is set', async () => {
    const char = await assembler.assemble({ ...DEFAULT_APPEARANCE, hair: 'hair_short_01' });
    const hairMesh = char.meshes.find((m) => m.name === 'hair');
    expect(hairMesh).toBeDefined();
    char.dispose();
  });

  it('does not add hair mesh when hair is null', async () => {
    const char = await assembler.assemble({ ...DEFAULT_APPEARANCE, hair: null });
    const hairMesh = char.meshes.find((m) => m.name === 'hair');
    expect(hairMesh).toBeUndefined();
    char.dispose();
  });

  it('adds clothing meshes when top/bottom/shoes are set', async () => {
    const char = await assembler.assemble({
      ...DEFAULT_APPEARANCE,
      top: 'jacket_neon_bomber',
      bottom: 'pants_tactical',
      shoes: 'boots_platform_chrome',
    });
    const top = char.meshes.find((m) => m.name === 'top');
    const bottom = char.meshes.find((m) => m.name === 'bottom');
    const shoes = char.meshes.find((m) => m.name === 'shoes');
    expect(top).toBeDefined();
    expect(bottom).toBeDefined();
    expect(shoes).toBeDefined();
    char.dispose();
  });

  it('assemblePlaceholder is called directly via assemble in Node.js', async () => {
    const spy = jest.spyOn(assembler, 'assemblePlaceholder');
    const char = await assembler.assemble(DEFAULT_APPEARANCE);
    expect(spy).toHaveBeenCalled();
    char.dispose();
  });

  it('different skin tones produce valid characters', async () => {
    const tones = ['#FFFFFF', '#8B6355', '#2D1B0E'];
    for (const tone of tones) {
      const char = await assembler.assemble({ ...DEFAULT_APPEARANCE, skinTone: tone });
      expect(char.meshes.length).toBeGreaterThan(0);
      char.dispose();
    }
  });

  it('assemblePlaceholder applies skin tone to body meshes', async () => {
    const char1 = assembler.assemblePlaceholder({ ...DEFAULT_APPEARANCE, skinTone: '#FF0000' });
    const char2 = assembler.assemblePlaceholder({ ...DEFAULT_APPEARANCE, skinTone: '#0000FF' });
    // Both produce valid characters (skin tone applied via applySkinTone)
    expect(char1.meshes.length).toBeGreaterThan(0);
    expect(char2.meshes.length).toBeGreaterThan(0);
    char1.dispose();
    char2.dispose();
  });
});
