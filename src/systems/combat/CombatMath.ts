/**
 * Turn-based combat math (pure; RNG injectable for tests).
 *
 * Owner-specified model (a turn represents ~1 second):
 *   - Action points: AP = round(Dexterity / apPerDexterity)  [default /10, cap 10].
 *     So the minimum Dexterity (20) = 2 AP = exactly one primary action and nothing
 *     else; Dexterity 60 = 6 AP; 100 = 10 AP. Dexterity is THE combat-tempo stat.
 *   - Costs: primary action = 2 AP (ranged shot / melee strike), secondary = 1 AP
 *     (take cover / hunker / reload / item), movement = 1 AP per metre.
 *   - To-hit uses the power-ratio SkillCheck (k=2): melee → Combate Corpo-a-Corpo
 *     (Força), ranged → Armas de Fogo (Destreza), vs the defender's dodge
 *     (Percepção/Destreza) plus cover (+20 partial / +40 full on the defender).
 *   - Damage on a hit scales with the governing attribute plus small variance.
 *   - Initiative is ordered by Dexterity (deterministic id tie-break).
 *
 * Distance is a single scalar (metres between the two combatants) — not a 2-D grid.
 * Everything here is a pure function; the encounter state machine (CombatEncounter)
 * and the browser overlay consume it.
 */

import { CharacterStats, checkValue } from '@entities/CharacterStats';
import { resolveCheck, CheckResult, RollFn, defaultRoll } from '../SkillCheck';

// ─── Tuning (mirrors the Options settings; defaults match the owner's model) ──

export interface CombatTuning {
  /** AP = round(Dexterity / apPerDexterity), capped at apMax. */
  apPerDexterity: number;
  apMax: number;
  /** AP cost of a primary action (attack / aimed shot). */
  primaryCost: number;
  /** AP cost of a secondary action (cover / hunker / reload / item). */
  secondaryCost: number;
  /** AP spent per metre of movement. */
  moveApPerMeter: number;
}

export const DEFAULT_COMBAT_TUNING: Readonly<CombatTuning> = {
  apPerDexterity: 10,
  apMax: 10,
  primaryCost: 2,
  secondaryCost: 1,
  moveApPerMeter: 1,
};

/** Distance (m) at or under which a melee strike is allowed (covers the 2 m start gap). */
export const MELEE_RANGE = 2;

/** Cover defence bonuses (defender +N), matching SkillCheck's cover convention. */
export const COVER_NONE = 0;
export const COVER_PARTIAL = 20;
export const COVER_FULL = 40;

/** The minimal settings shape needed to build a CombatTuning. */
export interface CombatSettingsShape {
  combatApPerDexterity: number;
  combatPrimaryCost: number;
  combatSecondaryCost: number;
  combatMoveApPerMeter: number;
}

/** Build a CombatTuning from the persisted Options settings (apMax stays fixed). */
export function combatTuningFromSettings(s: CombatSettingsShape): CombatTuning {
  return {
    apPerDexterity: s.combatApPerDexterity > 0 ? s.combatApPerDexterity : DEFAULT_COMBAT_TUNING.apPerDexterity,
    apMax: DEFAULT_COMBAT_TUNING.apMax,
    primaryCost: s.combatPrimaryCost,
    secondaryCost: s.combatSecondaryCost,
    moveApPerMeter: s.combatMoveApPerMeter,
  };
}

// ─── Action points & movement ─────────────────────────────────────────────────

/** Action points for a Dexterity value: round(Dex / apPerDexterity), capped. */
export function actionPointsFor(dexterity: number, tuning: CombatTuning = DEFAULT_COMBAT_TUNING): number {
  const raw = Math.round(Math.max(0, dexterity) / tuning.apPerDexterity);
  return Math.max(0, Math.min(tuning.apMax, raw));
}

/** AP to move `meters` metres (rounded up; movement is integral). */
export function moveApCost(meters: number, tuning: CombatTuning = DEFAULT_COMBAT_TUNING): number {
  return Math.ceil(Math.max(0, meters) * tuning.moveApPerMeter);
}

/** Maximum whole metres movable with `ap` action points. */
export function maxMoveMeters(ap: number, tuning: CombatTuning = DEFAULT_COMBAT_TUNING): number {
  if (tuning.moveApPerMeter <= 0) return 0;
  return Math.floor(Math.max(0, ap) / tuning.moveApPerMeter);
}

// ─── Attack resolution (to-hit) ───────────────────────────────────────────────

export type AttackKind = 'melee' | 'ranged';

export interface AttackContext {
  attacker: CharacterStats;
  defender: CharacterStats;
  kind: AttackKind;
  /** Defender cover bonus (COVER_NONE | COVER_PARTIAL | COVER_FULL). */
  coverMod?: number;
}

/** Attacker offence value: melee→Combate C-a-C/Força, ranged→Armas de Fogo/Destreza. */
export function attackValue(stats: CharacterStats, kind: AttackKind): number {
  return kind === 'melee'
    ? checkValue(stats, 'combate_corpo_a_corpo', 'forca')
    : checkValue(stats, 'armas_de_fogo', 'destreza');
}

/** Defender dodge value: Percepção (a Destreza skill), falling back to Destreza. */
export function dodgeValue(stats: CharacterStats): number {
  return checkValue(stats, 'percepcao', 'destreza');
}

/** Resolve whether an attack lands (power-ratio; cover raises the defender). */
export function resolveAttack(ctx: AttackContext, rng: RollFn = defaultRoll): CheckResult {
  return resolveCheck({
    value: attackValue(ctx.attacker, ctx.kind),
    opponent: dodgeValue(ctx.defender),
    mods: { defender: ctx.coverMod ?? 0 },
  }, rng);
}

// ─── Damage ───────────────────────────────────────────────────────────────────

export const MELEE_BASE = 8;
export const RANGED_BASE = 10;
/** Damage variance window: a d(0..DAMAGE_VARIANCE-1) is added to every hit. */
export const DAMAGE_VARIANCE = 5;

/** Damage on a hit: base + attribute scaling + d(0..variance-1). */
export function rollDamage(stats: CharacterStats, kind: AttackKind, rng: RollFn = defaultRoll): number {
  const variance = Math.floor(rng() * DAMAGE_VARIANCE);
  return kind === 'melee'
    ? MELEE_BASE + Math.floor(stats.attributes.forca / 10) + variance
    : RANGED_BASE + Math.floor(stats.attributes.destreza / 20) + variance;
}

// ─── Initiative ───────────────────────────────────────────────────────────────

export interface Initiable {
  id: string;
  dexterity: number;
}

/** Turn order: higher Dexterity first; ties broken by id (deterministic). */
export function initiativeOrder(combatants: Initiable[]): string[] {
  return [...combatants]
    .sort((a, b) => (b.dexterity - a.dexterity) || a.id.localeCompare(b.id))
    .map((c) => c.id);
}
