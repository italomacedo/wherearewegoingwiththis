export interface CharacterAppearance {
  bodyBase: string;       // asset key, e.g. "body_female_black"
  skinTone: string;       // hex color, e.g. "#8B5E3C"
  hair: string | null;    // asset key or null
  hairColor: string;      // hex color
  eyeStyle: string;       // asset key
  top: string | null;     // clothing top asset key
  bottom: string | null;
  shoes: string | null;
  accessories: string[];  // array of asset keys
  implants: string[];     // visible augmentation asset keys
}

export interface CharacterData {
  name: string;
  appearance: CharacterAppearance;
}

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  bodyBase: 'body_female_black',
  skinTone: '#8B6355',
  hair: 'hair_short_01',
  hairColor: '#1A1A1A',
  eyeStyle: 'eyes_default',
  top: null,
  bottom: null,
  shoes: null,
  accessories: [],
  implants: [],
};

export const BODY_BASES = [
  'body_female_asian',
  'body_female_black',
  'body_female_latina',
  'body_female_white',
  'body_male_asian',
  'body_male_black',
  'body_male_latino',
  'body_male_white',
] as const;

export type BodyBaseKey = (typeof BODY_BASES)[number];
