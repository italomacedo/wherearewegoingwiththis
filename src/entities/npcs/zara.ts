import { NPCDefinition } from '@entities/NPCAgent';
import { CharacterAppearance } from '@entities/CharacterData';
import { DEFAULT_COLORS } from '@entities/CharacterData';

/**
 * Zara's avatar — a punk woman (Quaternius `w_punk`), tinted for a streetwise look.
 * Built via the same CharacterAssembler pipeline the player uses (idle animation).
 */
const ZARA_APPEARANCE: CharacterAppearance = {
  bodyBase: 'w_punk',
  slots: {},
  morphs: {},
  colors: { ...DEFAULT_COLORS, skin: '#8A6552', hair: '#C81E5A', eye: '#2A3A2A' },
  skinTexture: 'skin_01',
  accessories: [],
  implants: [],
  avatarPieces: {},
};

/**
 * Zara — the first Claude-driven NPC. A wary street vendor in Mercado das Sombras.
 * This is the Phase 8 test subject: if Zara works, the NPC system works.
 */
export const ZARA_DEFINITION: NPCDefinition = {
  id: 'npc_zara_vendor_01',
  name: 'Zara',
  role: 'black-market data-chip vendor',
  location: 'Mercado das Sombras, stall 7',
  personalityPrompt:
    'You are wary but fair. You speak in short, clipped sentences. You have seen everything ' +
    'this city can throw at a person and you trust no one fully. You sell stolen data chips ' +
    'and information, and you size up everyone who approaches your stall. You are not cruel, ' +
    'just careful — the kind of person who survived because she never let her guard down.',
  defaultMood: 'suspicious',
  interactionRadius: 8,
  conversationRadius: 3,
  // Corner sidewalk just off the downtown intersection (matches VENDOR_SPOT in
  // WorldAssetCatalog — her vendor stall stands beside her).
  position: [7, 0, 7],
  appearance: ZARA_APPEARANCE,
};

export function createZara(): NPCDefinition {
  return { ...ZARA_DEFINITION, position: [...ZARA_DEFINITION.position] as [number, number, number] };
}
