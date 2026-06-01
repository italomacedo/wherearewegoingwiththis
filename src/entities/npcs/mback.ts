import { NPCDefinition } from '@entities/NPCAgent';
import { CharacterAppearance } from '@entities/CharacterData';
import { DEFAULT_COLORS } from '@entities/CharacterData';

/**
 * Old Mback's avatar — a weathered male fence (Quaternius `suit`), tinted drab.
 * Built via the same CharacterAssembler pipeline as the player (idle animation).
 */
const MBACK_APPEARANCE: CharacterAppearance = {
  bodyBase: 'suit',
  slots: {},
  morphs: {},
  colors: { ...DEFAULT_COLORS, skin: '#6E5038', hair: '#B8B0A4', eye: '#3A2E22' },
  skinTexture: 'skin_01',
  accessories: [],
  implants: [],
  avatarPieces: {},
};

/**
 * Old Mback — the second street NPC. A fence Zara owes a favour to; he works the
 * same strip a few doors down. Having two co-located NPCs lets the Fase 5 autonomy
 * surface live NPC↔NPC gossip on screen.
 */
export const MBACK_DEFINITION: NPCDefinition = {
  id: 'npc_mback_fence_01',
  name: 'Mback',
  role: 'back-alley fence',
  location: 'Mercado das Sombras, the corner pawn nook',
  personalityPrompt:
    'You are Old Mback, a tired but shrewd fence who has worked this strip for decades. ' +
    'You speak slowly, with dry humour, and you remember every debt. You move stolen goods, ' +
    'broker quiet deals, and keep your ear to the ground. You are fond of Zara in a gruff way ' +
    'and wary of the Vyse-Tek enforcers.',
  defaultMood: 'neutral',
  interactionRadius: 8,
  conversationRadius: 3,
  // North sidewalk, a few doors down from Zara (within gossip range, out of her
  // conversation radius). Matches the catalog's walkable north lane (z≈6–7).
  position: [12, 0, 6],
  appearance: MBACK_APPEARANCE,
  home: 'a back room behind the shuttered pawn shop on the corner',
  backstory:
    'Has fenced goods on this strip since before the corps moved in; outlived most of his rivals ' +
    'by never being greedy and never trusting a deal that looked too clean.',
  routine:
    'Holds court by the corner from dusk, trading rumours and merchandise, then counts the night ' +
    'take in the back room before dawn.',
  relationships:
    'Zara owes him a favour and he keeps a soft spot for her; steers well clear of the Vyse-Tek crew.',
  initialDisposition: 'neutral',
};

export function createMback(): NPCDefinition {
  return { ...MBACK_DEFINITION, position: [...MBACK_DEFINITION.position] as [number, number, number] };
}
