/**
 * NpcRandomizer — "Generate NPC" button for the Scene Editor: a deterministic
 * (injected RollFn) random NPC with name, outfit, attributes and a short
 * persona, all editable afterwards in the properties panel. Pure, 100% tested.
 */
import type { RollFn } from '@systems/SkillCheck';
import { OUTFITS } from '@assets/AvatarMeshCatalog';
import { ATTRIBUTES, type AttributeId } from '@entities/CharacterStats';
import type { SceneNpcDoc } from './SceneDoc';

const FIRST_NAMES = [
  'Rex', 'Nyx', 'Kira', 'Dante', 'Vera', 'Silas', 'Mona', 'Jax', 'Iris', 'Cole',
  'Zeta', 'Rui', 'Tessa', 'Brick', 'Luna', 'Hex', 'Sable', 'Nico', 'Vex', 'Ada',
];
const SURNAMES = [
  'Vale', 'Okoro', 'Reyes', 'Mori', 'Duarte', 'Klein', 'Sousa', 'Volt', 'Iwata', 'Marsh',
];

interface PersonaTemplate {
  role: string;
  personality: string;
  backstory: string;
  routine: string;
}

const PERSONAS: PersonaTemplate[] = [
  {
    role: 'street vendor',
    personality: 'Talks fast, haggles everything, never gives a straight answer for free.',
    backstory: 'Lost a corporate job in the last purge and rebuilt life around a stall.',
    routine: 'Opens the stall at dawn, watches the street, closes when the rain gets heavy.',
  },
  {
    role: 'off-duty courier',
    personality: 'Restless and direct, always scanning for the fastest route out.',
    backstory: 'Runs packages no one else will touch between districts.',
    routine: 'Sleeps in short bursts, eats standing up, takes jobs at night.',
  },
  {
    role: 'tired medtech',
    personality: 'Dry humour, clinical eye, has seen too much to be shocked.',
    backstory: 'Patched up both gangers and execs; keeps strict neutrality.',
    routine: 'Day shifts at a back-alley clinic, evenings nursing one drink.',
  },
  {
    role: 'data scavenger',
    personality: 'Paranoid but curious, speaks in half-finished thoughts.',
    backstory: 'Mines abandoned servers for fragments worth selling.',
    routine: 'Nocturnal; daylight is for sleeping and avoiding people.',
  },
  {
    role: 'corner musician',
    personality: 'Warm, observant, trades gossip for attention.',
    backstory: 'Once toured arcologies; now plays for credits and company.',
    routine: 'Plays the same corner every evening, knows every regular.',
  },
  {
    role: 'retired enforcer',
    personality: 'Slow to speak, heavy presence, values respect over credits.',
    backstory: 'Did collections for a syndicate until the knees gave out.',
    routine: 'Morning walks, afternoon watching the block, early nights.',
  },
];

function pickFrom<T>(rng: RollFn, arr: readonly T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

/** Attributes rolled 10–60 in steps of 5 (viable but varied NPC blocks). */
export function randomAttributes(rng: RollFn): Record<AttributeId, number> {
  const out = {} as Record<AttributeId, number>;
  for (const a of ATTRIBUTES) out[a.id] = 10 + Math.floor(rng() * 11) * 5;
  return out;
}

export function randomNpc(rng: RollFn, at: [number, number, number] = [0, 0, 0]): Omit<SceneNpcDoc, 'id'> {
  const name = `${pickFrom(rng, FIRST_NAMES)} ${pickFrom(rng, SURNAMES)}`;
  const outfit = pickFrom(rng, OUTFITS).key;
  const persona = pickFrom(rng, PERSONAS);
  return {
    name,
    role: persona.role,
    personalityPrompt: persona.personality,
    backstory: persona.backstory,
    routine: persona.routine,
    defaultMood: 'neutral',
    initialDisposition: 'neutral',
    outfit,
    attributes: randomAttributes(rng),
    position: at,
  };
}
