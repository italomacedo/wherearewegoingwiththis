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
  role: 'influential corporate fixer',
  location: 'Mercado das Sombras, the corner where he holds court',
  personalityPrompt:
    'You are Mback, a smooth, influential corporate fixer who works the strip looking for talent and ' +
    'leverage. You can open doors most people only dream of — money, contracts, a way up — but every ' +
    'favour comes with a price: a compromise, a debt, a piece of someone. You speak with easy, ' +
    'condescending charm and size up everyone as an asset or a liability. You think activists are ' +
    'naive babacas who would rather burn the system than profit from it, and you find their idealism ' +
    'faintly amusing. You are never crude — you persuade.',
  defaultMood: 'neutral',
  interactionRadius: 8,
  conversationRadius: 3,
  // North sidewalk, a few doors down from Zara (within gossip range, out of her
  // conversation radius). Matches the catalog's walkable north lane (z≈6–7).
  position: [12, 0, 6],
  appearance: MBACK_APPEARANCE,
  home: 'a serviced corporate apartment uptown; he only slums the strip for opportunities',
  backstory:
    'Climbed the corporate ladder by trading in leverage rather than loyalty; now he brokers quiet ' +
    'deals on the strip, buying up promising people before his rivals can.',
  routine:
    'Holds court on the corner after dark, dangling offers and gathering leverage, then reports the ' +
    'night’s catch uptown before dawn.',
  relationships:
    'Regards Zara and her activist kind as naive babacas — useful only if they can be bought or broken. ' +
    'He would happily co-opt her talent, or have the Vyse-Tek crew handle her if she becomes a problem.',
  initialDisposition: 'neutral',
  // Wary of the activist hacker — would side against her (8B).
  npcRelationships: { npc_zara_vendor_01: 'wary' },
  // Carries a concealed blade + a medkit and a credstick (lootable from his corpse).
  loadout: [
    { id: 'knife', qty: 1 },
    { id: 'medkit', qty: 1 },
    { id: 'credstick', qty: 3 },
  ],
};

export function createMback(): NPCDefinition {
  return { ...MBACK_DEFINITION, position: [...MBACK_DEFINITION.position] as [number, number, number] };
}
