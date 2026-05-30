import {
  CharacterData, CharacterAppearance, DEFAULT_APPEARANCE, BODY_BASES,
} from '../../../src/entities/CharacterData';

describe('CharacterData', () => {
  it('DEFAULT_APPEARANCE has required fields', () => {
    expect(DEFAULT_APPEARANCE.bodyBase).toBeDefined();
    expect(DEFAULT_APPEARANCE.skinTone).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(DEFAULT_APPEARANCE.hairColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(Array.isArray(DEFAULT_APPEARANCE.accessories)).toBe(true);
    expect(Array.isArray(DEFAULT_APPEARANCE.implants)).toBe(true);
  });

  it('BODY_BASES contains 8 variants', () => {
    expect(BODY_BASES.length).toBe(8);
  });

  it('BODY_BASES includes female and male variants', () => {
    const female = BODY_BASES.filter((b) => b.startsWith('body_female'));
    const male = BODY_BASES.filter((b) => b.startsWith('body_male'));
    expect(female.length).toBe(4);
    expect(male.length).toBe(4);
  });

  it('CharacterData interface is satisfied by defaults', () => {
    const data: CharacterData = {
      name: 'Test',
      appearance: { ...DEFAULT_APPEARANCE },
    };
    expect(data.name).toBe('Test');
    expect(data.appearance.bodyBase).toBe(DEFAULT_APPEARANCE.bodyBase);
  });

  it('CharacterAppearance can have null clothing slots', () => {
    const appearance: CharacterAppearance = {
      ...DEFAULT_APPEARANCE,
      top: null,
      bottom: null,
      shoes: null,
    };
    expect(appearance.top).toBeNull();
    expect(appearance.bottom).toBeNull();
    expect(appearance.shoes).toBeNull();
  });

  it('CharacterAppearance supports multiple implants', () => {
    const appearance: CharacterAppearance = {
      ...DEFAULT_APPEARANCE,
      implants: ['eye_mod_left_optical', 'neck_data_port'],
    };
    expect(appearance.implants).toHaveLength(2);
  });
});
