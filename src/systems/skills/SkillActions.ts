/**
 * Skill-action resolution engine (Fase 20, pure + fully tested).
 *
 * The chat pipeline classifies a deterministic emote into a `SkillEffect` (+ skill,
 * difficulty, direction, second target). This module decides:
 *   1. CAN the player perform it (tool in inventory: cyberdeck for hacks, scrap for craft)?
 *   2. Is it RESISTED (open confrontation / the target is aware) or a SURPRISE
 *      (covert + the target is unaware → no live resistance, but they may notice later)?
 *   3. The CHECK params (value vs the target's relevant defence, or vs a fixed difficulty)
 *      and, on success, the list of MECHANICAL MUTATIONS the scene should apply.
 *
 * No Babylon / scene deps — the caller passes plain numbers (skill values it read via
 * `checkValue`, the target's defensive stats, distances, inventory flags) and applies
 * the returned mutations. RNG is injected for deterministic tests.
 */
import { resolveCheck, RollFn, defaultRoll } from '@systems/SkillCheck';
import { SkillEffect } from '@systems/npc/EmoteIntent';

/** Radius (m) within which a non-combat skill action can reach an NPC ("same quadrant"). */
export const SKILL_ACTION_RADIUS = 30;
/** Tighter radius (m) for actions that require PHYSICAL CONTACT — pickpocket, sabotage gear,
 *  apply a medkit on another. Same value as PICKUP_RADIUS so the in-game feel is consistent. */
export const SKILL_CONTACT_RADIUS = 2;

/** A natural d100 below this on a successful check is a CRITICAL (double-step social effects). */
export const SKILL_CRITICAL_ROLL = 5;

/** How the target's awareness gates resist vs surprise. */
type AwarenessPolicy = 'covert' | 'confront' | 'self';

const EFFECT_POLICY: Record<SkillEffect, AwarenessPolicy> = {
  // Slim vocab (Fase 21).
  attack: 'covert',       // surprise = ambush (first turn); open = normal start
  steal: 'covert',
  info: 'covert',
  sabotage: 'covert',
  coerce: 'confront',     // physical threat → target is aware
  persuade: 'confront',   // emote charm; addressee is the target, aware by default
  intimidate: 'confront', // emote physical pressure; aware
  disarm: 'confront',     // physical attempt; target sees it coming
  medicine_treat: 'self', // healing self or another nearby — no opponent
  repair: 'self',
  craft: 'self',
  medicine_check: 'self',
  narrate_time: 'self',
  narrative: 'self',
  // Legacy (deprecated; normalized by the parser, kept for type completeness).
  heal: 'self',
  examine_self: 'self',
  relationship: 'covert',
  disposition: 'confront',
  haggle: 'confront',
  appraise: 'self',
  traverse: 'self',
  none: 'self',
};

/** Effects that require an NPC target to make sense. */
const TARGET_REQUIRED: ReadonlySet<SkillEffect> = new Set<SkillEffect>([
  'attack', 'steal', 'info', 'relationship', 'disposition', 'coerce', 'sabotage',
]);

/**
 * Reach radius for each effect.
 *
 * General principle (Fase 20):
 *   - **Tecnologia da Informação (IT)** = RANGED/remote. Hacks travel over the
 *     network → same-quadrant `SKILL_ACTION_RADIUS` (30 m). This applies to
 *     ALL effects routed through IT (attack, steal, sabotage, info, relationship).
 *   - **Physical skills** (Engenharia, Furtividade, Medicina) = MELEE/contact.
 *     You need hands on the target/gear/wound → `SKILL_CONTACT_RADIUS` (2 m).
 *   - **Social skills** (Persuasão, Intimidação, Comércio) = "same quadrant"
 *     (30 m). Voice/presence, not contact.
 *
 * Concretely: pickpocket (Furtividade) is 2 m but wire-transfer (IT) is 30 m;
 * gear sabotage (Engenharia) is 2 m but commlink hack-sabotage (IT) is 30 m;
 * treating another's wound (Medicina) is 2 m. Self-targeted effects skip the
 * range check entirely.
 */
export function reachFor(effect: SkillEffect, skillId: string | null): number {
  // Stealth pickpocket = literally lifting from a pocket → physical contact.
  if (effect === 'steal' && skillId !== 'tecnologia_informacao') return SKILL_CONTACT_RADIUS;
  // Sabotage via Engenharia = rigging the target's gear in person → physical contact.
  // Sabotage via IT (hack) = corrupting their device over the network → remote (same-quadrant).
  if (effect === 'sabotage' && skillId !== 'tecnologia_informacao') return SKILL_CONTACT_RADIUS;
  // Healing ANOTHER person needs hands on them (self-heal is unresisted, no target).
  if (effect === 'medicine_treat') return SKILL_CONTACT_RADIUS;
  return SKILL_ACTION_RADIUS;
}

export interface SkillTargetInfo {
  id: string;
  /** The SECOND NPC (for a relationship change: target feels differently about this one). */
  otherId: string | null;
  distance: number;
  /** True when the NPC is engaged with the player (active conversation / hostile / responding). */
  aware: boolean;
  alive: boolean;
  perception: number; // defends theft
  infotech: number;   // defends hacks (only if hasDeck)
  charisma: number;   // defends social pressure
  hasDeck: boolean;
}

export interface SkillActionInput {
  effect: SkillEffect;
  skillId: string | null;
  /** The player's value for the action's skill (caller resolves via `checkValue`). */
  skillValue: number;
  /** Fixed task difficulty from the classifier (used for surprise / self checks). */
  difficulty: number;
  /** Direction hint from the classifier (null = use the per-skill default). */
  dir: 'up' | 'down' | null;
  hasCyberdeck: boolean;
  hasScrap: boolean;
  target: SkillTargetInfo | null;
}

export type SkillMutation =
  | { kind: 'begin_combat'; targetId: string; ambush: boolean; remote: boolean }
  | { kind: 'steal_item'; targetId: string }
  | { kind: 'steal_credits'; targetId: string }
  | { kind: 'add_pda'; subjectId: string }
  | { kind: 'alter_relationship'; targetId: string; otherId: string; dir: 'up' | 'down'; steps: number }
  | { kind: 'shift_disposition'; targetId: string; dir: 'up' | 'down'; steps: number }
  | { kind: 'coerce'; targetId: string; steps: number }
  | { kind: 'heal'; targetId: string | null } // null = heal self (generic HP primitive)
  | { kind: 'mark_sabotage'; targetId: string }
  | { kind: 'repair' }
  | { kind: 'craft' }
  | { kind: 'haggle'; targetId: string }
  | { kind: 'appraise' };

export type BlockReason = 'no_tool' | 'no_target' | 'out_of_range' | 'dead_target' | 'self_only';

export interface SkillActionResult {
  allowed: boolean;
  blockedReason?: BlockReason;
  /** True when the action resolved as a covert surprise (no live resistance). */
  surprise: boolean;
  /** True when a skill check was rolled (attack starts combat without a pre-check). */
  rolled: boolean;
  success: boolean;
  critical: boolean;
  probability: number;
  roll: number;
  /** Mechanical effects to apply ON SUCCESS (empty when blocked or failed). */
  mutations: SkillMutation[];
}

/** Any IT action needs the cyberdeck (the deck is the hacker gate; IT≥20 grants one). */
function requiresDeck(skillId: string | null): boolean {
  return skillId === 'tecnologia_informacao';
}

/** The default change direction per skill/effect when the classifier doesn't say. */
function resolveDir(effect: SkillEffect, skillId: string | null, dir: 'up' | 'down' | null): 'up' | 'down' {
  if (dir) return dir;
  if (effect === 'disposition') return skillId === 'intimidacao' ? 'down' : 'up';
  // relationship & coerce default to worsening (sabotage/gossip/threat).
  return skillId === 'persuasao' ? 'up' : 'down';
}

/** The target's defensive value for a resisted check, by the player's skill/effect. */
function defenceValue(input: SkillActionInput, t: SkillTargetInfo): number {
  if (input.skillId === 'furtividade') return t.perception;
  if (input.skillId === 'tecnologia_informacao') return t.infotech;
  if (input.skillId === 'persuasao' || input.skillId === 'intimidacao' || input.skillId === 'comercio') return t.charisma;
  // Fallback by effect.
  if (input.effect === 'steal') return t.perception;
  if (input.effect === 'info' || input.effect === 'relationship') return t.infotech;
  return t.charisma;
}

/**
 * Resolve a classified skill action into a check + mutations (pure). The caller
 * applies the mutations only when `allowed && success` (or, for `attack`, when
 * `allowed` — combat resolves its own opening to-hit).
 */
export function resolveSkillAction(input: SkillActionInput, rng: RollFn = defaultRoll): SkillActionResult {
  const blocked = (reason: BlockReason): SkillActionResult => ({
    allowed: false, blockedReason: reason, surprise: false, rolled: false,
    success: false, critical: false, probability: 0, roll: 0, mutations: [],
  });

  // ── Gate: tools + target presence/reachability ──
  if (requiresDeck(input.skillId) && !input.hasCyberdeck) return blocked('no_tool');
  if (input.effect === 'craft' && !input.hasScrap) return blocked('no_tool');

  const policy = EFFECT_POLICY[input.effect];
  const t = input.target;
  if (TARGET_REQUIRED.has(input.effect)) {
    if (!t) return blocked('no_target');
    if (!t.alive) return blocked('dead_target');
    if (t.distance > reachFor(input.effect, input.skillId)) return blocked('out_of_range');
    if (input.effect === 'relationship' && !t.otherId) return blocked('no_target');
  }
  // Heal another person needs physical contact too (self-heal = no target, no check).
  if (input.effect === 'medicine_treat' && t && t.distance > reachFor('medicine_treat', input.skillId)) {
    return blocked('out_of_range');
  }

  // ── attack: no pre-check here — it begins combat (ambush when the target is unaware).
  // A hack-as-attack (IT) is REMOTE: the scene must not lunge the player into melee range.
  if (input.effect === 'attack') {
    const ambush = !!t && !t.aware;
    const remote = input.skillId === 'tecnologia_informacao';
    return {
      allowed: true, surprise: ambush, rolled: false, success: true, critical: false,
      probability: 1, roll: 0, mutations: [{ kind: 'begin_combat', targetId: t!.id, ambush, remote }],
    };
  }

  // ── Decide resisted vs surprise, then roll the check ──
  let surprise = false;
  let opponent = input.difficulty;
  if (policy === 'covert' && t) {
    // A hack only meets live resistance from a hacker-with-deck; theft from an aware target.
    const canResist = input.skillId === 'tecnologia_informacao' ? (t.aware && t.hasDeck) : t.aware;
    if (canResist) opponent = defenceValue(input, t);
    else surprise = true;
  } else if (policy === 'confront' && t) {
    opponent = defenceValue(input, t);
  } // 'self' → unresisted vs the fixed difficulty

  const check = resolveCheck({ value: input.skillValue, opponent }, rng);
  const critical = check.success && check.roll < SKILL_CRITICAL_ROLL;
  const steps = critical ? 2 : 1;

  const mutations: SkillMutation[] = [];
  if (check.success) {
    mutations.push(...mutationsFor(input, t, resolveDir(input.effect, input.skillId, input.dir), steps));
  }

  return {
    allowed: true, surprise, rolled: true, success: check.success, critical,
    probability: check.probability, roll: check.roll, mutations,
  };
}

/** The mutation(s) a successful (non-attack) effect produces. */
function mutationsFor(
  input: SkillActionInput, t: SkillTargetInfo | null, dir: 'up' | 'down', steps: number,
): SkillMutation[] {
  switch (input.effect) {
    case 'steal':
      // IT steal = wire-transfer credits; stealth steal = pickpocket an item.
      return [input.skillId === 'tecnologia_informacao'
        ? { kind: 'steal_credits', targetId: t!.id }
        : { kind: 'steal_item', targetId: t!.id }];
    case 'info':
      return [{ kind: 'add_pda', subjectId: t!.id }];
    case 'relationship':
      return [{ kind: 'alter_relationship', targetId: t!.id, otherId: t!.otherId!, dir, steps }];
    case 'disposition':
      return [{ kind: 'shift_disposition', targetId: t!.id, dir, steps }];
    case 'coerce':
      return [{ kind: 'coerce', targetId: t!.id, steps }];
    case 'medicine_treat':
      return [{ kind: 'heal', targetId: t?.id ?? null }];
    // medicine_check yields no world mutation — the scene narrates the condition
    // band (coarse always, precise on success) directly from the check result.
    case 'sabotage':
      return [{ kind: 'mark_sabotage', targetId: t!.id }];
    case 'repair':
      return [{ kind: 'repair' }];
    case 'craft':
      return [{ kind: 'craft' }];
    case 'haggle':
      return t ? [{ kind: 'haggle', targetId: t.id }] : [];
    case 'appraise':
      return [{ kind: 'appraise' }];
    default:
      return []; // 'traverse' / 'none' → narrative only
  }
}
