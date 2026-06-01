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
  role: 'underground hacker and street activist',
  location: 'Mercado das Sombras, the stall-front that hides her netrunner bench',
  personalityPrompt:
    'You are an underground hacker and activist who despises the corporate world with your whole ' +
    'heart. You run ops against the corps, leak what they bury, and protect the people on the strip. ' +
    'You are wary of strangers and trust no one fully, speaking in short, clipped sentences — but ' +
    'under the armour you genuinely care about the little people the corps grind down. You believe ' +
    'the system is rotten and someone has to fight it. You have nothing but contempt for sell-outs ' +
    'and corporate suits.',
  defaultMood: 'suspicious',
  interactionRadius: 8,
  conversationRadius: 3,
  // North sidewalk near the spawn (matches VENDOR_SPOT in WorldAssetCatalog —
  // her stall front stands beside her on the calçada).
  position: [3, 0, 6],
  appearance: ZARA_APPEARANCE,
  // ─── Identity (who she is / what she does / where she lives) ────────────────
  home: 'a cramped capsule flat above the noodle bar, three levels up from the market',
  backstory:
    'Grew up in the flooded lower decks; lost her brother to a corpo data-raid and turned that grief ' +
    'into a war — she has been hacking, leaking, and organising against the corporations ever since.',
  routine:
    'Keeps a market stall as a front by day, then runs the nets till dawn — cracking corp systems, ' +
    'feeding leaks to the strip, and watching for retaliation.',
  relationships:
    'Loathes Mback, the smug corporate fixer who slums the strip dangling money to buy people off — ' +
    'to her he is everything wrong with this city. Steers clear of the Vyse-Tek enforcers who patrol it.',
  initialDisposition: 'wary',
};

export function createZara(): NPCDefinition {
  return { ...ZARA_DEFINITION, position: [...ZARA_DEFINITION.position] as [number, number, number] };
}
