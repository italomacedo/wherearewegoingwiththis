/**
 * RPG stats: attributes, skills, perks — pure data + rules (no engine). See the
 * Phase 3 design.
 *
 * Model
 * -----
 * - 4 attributes (0–100%). Start: 20% each, one chosen attribute = 30%.
 * - Skills (0–100%), each governed by an attribute. Start: 2 skills @40%, 3 @20%,
 *   the rest @10%.
 * - Learning by doing: each use of a skill nudges the skill AND its parent
 *   attribute by +0.1% (× an Options multiplier), capped at 100.
 * - Perks: 5 tiers per attribute (weak → broken). Each 20% of the attribute
 *   unlocks a tier; the player chooses 1 perk from that tier. Perk EFFECTS are
 *   wired in the combat phase — here we model the catalog + unlock + choice.
 *
 * Check resolution (used by the Phase 4 cRPG checks):
 * - The value tested is the relevant SKILL% if the action clearly fits one, else
 *   a fallback to the governing ATTRIBUTE% (`checkValue`). The actual roll math
 *   lives in systems/SkillCheck.ts.
 */

export type AttributeId = 'forca' | 'destreza' | 'inteligencia' | 'carisma';

export interface AttributeDef {
  id: AttributeId;
  label: string;
}

export const ATTRIBUTES: readonly AttributeDef[] = [
  { id: 'forca', label: 'Força' },
  { id: 'destreza', label: 'Destreza' },
  { id: 'inteligencia', label: 'Inteligência' },
  { id: 'carisma', label: 'Carisma' },
];

export type SkillId =
  | 'combate_corpo_a_corpo' | 'atletismo' | 'resistencia'
  | 'armas_de_fogo' | 'furtividade' | 'pilotagem' | 'percepcao'
  | 'tecnologia_informacao' | 'engenharia' | 'medicina'
  | 'persuasao' | 'intimidacao' | 'comercio';

export interface SkillDef {
  id: SkillId;
  label: string;
  attribute: AttributeId;
}

export const SKILLS: readonly SkillDef[] = [
  // Força
  { id: 'combate_corpo_a_corpo', label: 'Combate Corpo-a-Corpo', attribute: 'forca' },
  { id: 'atletismo', label: 'Atletismo', attribute: 'forca' },
  { id: 'resistencia', label: 'Resistência', attribute: 'forca' },
  // Destreza
  { id: 'armas_de_fogo', label: 'Armas de Fogo', attribute: 'destreza' },
  { id: 'furtividade', label: 'Furtividade', attribute: 'destreza' },
  { id: 'pilotagem', label: 'Pilotagem', attribute: 'destreza' },
  { id: 'percepcao', label: 'Percepção', attribute: 'destreza' },
  // Inteligência
  { id: 'tecnologia_informacao', label: 'Tecnologia da Informação', attribute: 'inteligencia' },
  { id: 'engenharia', label: 'Engenharia', attribute: 'inteligencia' },
  { id: 'medicina', label: 'Medicina', attribute: 'inteligencia' },
  // Carisma
  { id: 'persuasao', label: 'Persuasão', attribute: 'carisma' },
  { id: 'intimidacao', label: 'Intimidação', attribute: 'carisma' },
  { id: 'comercio', label: 'Comércio', attribute: 'carisma' },
];

export interface PerkDef {
  id: string;
  label: string;
  description: string;
  attribute: AttributeId;
  tier: number; // 1..PERK_TIERS
  /** Mechanical effect wired in the combat phase; flavour only for now. */
  effectPending: true;
}

// [attribute, tier, label, description] — 2 perks per tier, weak (T1) → broken (T5).
const PERK_DEFS: ReadonlyArray<readonly [AttributeId, number, string, string]> = [
  // ── Força ──
  ['forca', 1, 'Punho Calejado', 'Golpes desarmados doem um pouco mais.'],
  ['forca', 1, 'Fôlego de Rua', 'Corre e carrega por mais tempo sem cansar.'],
  ['forca', 2, 'Pancada Firme', 'Chance de atordoar com um golpe pesado.'],
  ['forca', 2, 'Equilíbrio Felino', 'Mais difícil de derrubar ou empurrar.'],
  ['forca', 3, 'Quebra-Guarda', 'Ignora parte da defesa corpo-a-corpo do alvo.'],
  ['forca', 3, 'Limiar de Dor', 'Continua lutando bem mesmo ferido.'],
  ['forca', 4, 'Investida Brutal', 'Avança e arremessa inimigos próximos.'],
  ['forca', 4, 'Pele de Couro', 'Reduz o dano físico recebido.'],
  ['forca', 5, 'Fúria Cibernética', 'Surto de força que multiplica o dano por instantes.'],
  ['forca', 5, 'Tanque de Carne', 'Vida máxima e resistência muito ampliadas.'],
  // ── Destreza ──
  ['destreza', 1, 'Dedos Leves', 'Pequeno bônus em furtar e arrombar.'],
  ['destreza', 1, 'Passo Macio', 'Faz menos ruído ao se mover.'],
  ['destreza', 2, 'Mira Estável', 'Menos dispersão ao atirar parado.'],
  ['destreza', 2, 'Reflexo Rápido', 'Melhora a iniciativa e a esquiva.'],
  ['destreza', 3, 'Saque Veloz', 'Saca e recarrega armas mais rápido.'],
  ['destreza', 3, 'Sombra', 'Permanece oculto por mais tempo em movimento.'],
  ['destreza', 4, 'Tiro Certeiro', 'Chance ampliada de acerto crítico à distância.'],
  ['destreza', 4, 'Piloto Nato', 'Veículos respondem melhor e sofrem menos dano.'],
  ['destreza', 5, 'Bullet Time', 'O tempo parece desacelerar ao mirar.'],
  ['destreza', 5, 'Fantasma', 'Quase indetectável enquanto agachado.'],
  // ── Inteligência ──
  ['inteligencia', 1, 'Olho Clínico', 'Lê sinais vitais e estados com mais clareza.'],
  ['inteligencia', 1, 'Bricolagem', 'Conserta itens simples com sucata.'],
  ['inteligencia', 2, 'Leitura de Rede', 'Detecta nós e câmeras hackeáveis por perto.'],
  ['inteligencia', 2, 'Improviso Técnico', 'Fabrica gambiarras úteis em campo.'],
  ['inteligencia', 3, 'Intrusão', 'Invade sistemas com menos resistência.'],
  ['inteligencia', 3, 'Cirurgião de Campo', 'Estabiliza e cura ferimentos graves.'],
  ['inteligencia', 4, 'Daemon', 'Implanta rotinas que enfraquecem alvos em rede.'],
  ['inteligencia', 4, 'Engenheiro-Chefe', 'Cria e melhora equipamentos avançados.'],
  ['inteligencia', 5, 'Netrunner', 'Domina o ciberespaço; intrusões quase triviais.'],
  ['inteligencia', 5, 'Tecnomante', 'Controla múltiplos sistemas ao mesmo tempo.'],
  // ── Carisma ──
  ['carisma', 1, 'Lábia', 'Pequeno bônus ao persuadir.'],
  ['carisma', 1, 'Cara de Pau', 'Mente com mais convicção.'],
  ['carisma', 2, 'Pechincha', 'Melhores preços ao comprar e vender.'],
  ['carisma', 2, 'Presença', 'Faz-se notar e respeitar numa sala.'],
  ['carisma', 3, 'Manipulador', 'Inclina atitudes alheias a seu favor.'],
  ['carisma', 3, 'Intimidador', 'Faz inimigos hesitarem ou recuarem.'],
  ['carisma', 4, 'Negociador Frio', 'Fecha acordos mesmo sob pressão.'],
  ['carisma', 4, 'Carisma Magnético', 'Atrai aliados e simpatia com facilidade.'],
  ['carisma', 5, 'Mente-Mestra', 'Orquestra pessoas como peças de um plano.'],
  ['carisma', 5, 'Ídolo da Rua', 'Sua reputação abre portas em toda a cidade.'],
];

export const PERKS: readonly PerkDef[] = PERK_DEFS.map(([attribute, tier, label, description]) => ({
  id: `${attribute}_t${tier}_${slug(label)}`,
  label,
  description,
  attribute,
  tier,
  effectPending: true as const,
}));

function slug(label: string): string {
  return label
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const ATTR_BASE = 20;        // every attribute starts here
export const ATTR_PRIMARY = 40;     // the chosen primary attribute
export const ATTR_SECONDARY = 30;   // the chosen secondary attribute (different from primary)
export const SKILL_BASE = 10;       // every untrained skill starts here
export const SKILL_MAJOR = 40;      // 2 starting skills
export const SKILL_MINOR = 20;      // 3 starting skills
export const START_MAJOR_COUNT = 2;
export const START_MINOR_COUNT = 3;
export const USE_GAIN = 0.1;        // per skill use, before the Options multiplier
export const STAT_MAX = 100;
export const PERK_TIER_STEP = 20;   // attribute % per tier
export const PERK_TIERS = 5;        // tiers per attribute

// ─── Derived combat/world status (Fase 20: HP is pervasive, scaled by Resistência) ──
export const BASE_HP = 100;         // baseline max HP at the starting Resistência (10)
/** Min IT% to count as a hacker (born with a cyberdeck) — creation + procedural NPC gen. */
export const HACKER_SKILL_THRESHOLD = 20;

/**
 * Pure: a sheet's maximum HP, scaled by Resistência on top of the baseline (Fase 20,
 * decision #12). At Resistência 10 (untrained) = BASE_HP; +0.5 HP per point above 10
 * (e.g. 40 → 115, 100 → 145). Tunable constant kept in code (owner's call). Floored at 1.
 */
export function maxHpFor(stats: CharacterStats): number {
  const resistencia = stats.skills['resistencia'] ?? SKILL_BASE;
  return Math.max(1, Math.round(BASE_HP + (resistencia - SKILL_BASE) * 0.5));
}

/** True when the sheet's Information Technology skill makes them an (amateur) hacker. */
export function isHacker(stats: CharacterStats): boolean {
  return (stats.skills['tecnologia_informacao'] ?? SKILL_BASE) >= HACKER_SKILL_THRESHOLD;
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

const SKILL_BY_ID = new Map<string, SkillDef>(SKILLS.map((s) => [s.id, s]));
const PERK_BY_ID = new Map<string, PerkDef>(PERKS.map((p) => [p.id, p]));

export function skillDef(id: string): SkillDef | undefined { return SKILL_BY_ID.get(id); }
export function perkDef(id: string): PerkDef | undefined { return PERK_BY_ID.get(id); }
export function skillsForAttribute(attr: AttributeId): SkillDef[] {
  return SKILLS.filter((s) => s.attribute === attr);
}
export function perksForTier(attr: AttributeId, tier: number): PerkDef[] {
  return PERKS.filter((p) => p.attribute === attr && p.tier === tier);
}

// ─── State ──────────────────────────────────────────────────────────────────

export interface CharacterStats {
  attributes: Record<AttributeId, number>;
  skills: Record<string, number>;
  perks: string[]; // chosen perk ids
  /** Unspent perk points per attribute, earned when an attribute crosses a 20-point
   *  threshold (40/60/80/100). Tier-1 perks are free at character creation. */
  perkPoints: Partial<Record<AttributeId, number>>;
}

/** A fresh sheet: every attribute 20%, every skill 10%, no perks. */
export function createDefaultStats(): CharacterStats {
  const attributes = {} as Record<AttributeId, number>;
  ATTRIBUTES.forEach((a) => { attributes[a.id] = ATTR_BASE; });
  const skills: Record<string, number> = {};
  SKILLS.forEach((s) => { skills[s.id] = SKILL_BASE; });
  return { attributes, skills, perks: [], perkPoints: {} };
}

function clamp(v: number): number {
  return Math.min(STAT_MAX, Math.max(0, v));
}

/** Set the chosen primary attribute to 40%, the others to 20% (creation, legacy 1-tier). */
export function setPrimaryAttribute(stats: CharacterStats, primary: AttributeId): CharacterStats {
  const attributes = {} as Record<AttributeId, number>;
  ATTRIBUTES.forEach((a) => { attributes[a.id] = a.id === primary ? ATTR_PRIMARY : ATTR_BASE; });
  return { ...stats, attributes };
}

/**
 * Set BOTH the primary (40%) and secondary (30%) attributes; the other two go to 20%
 * (creation). The two ids must be distinct. A null `secondary` falls back to 1-tier
 * (only the primary at 40%, the rest at 20%). Pure.
 */
export function setPrimaryAndSecondaryAttributes(
  stats: CharacterStats, primary: AttributeId, secondary: AttributeId | null,
): CharacterStats {
  const attributes = {} as Record<AttributeId, number>;
  ATTRIBUTES.forEach((a) => {
    if (a.id === primary) attributes[a.id] = ATTR_PRIMARY;
    else if (secondary && a.id === secondary && a.id !== primary) attributes[a.id] = ATTR_SECONDARY;
    else attributes[a.id] = ATTR_BASE;
  });
  return { ...stats, attributes };
}

/** True when a starting skill allocation is exactly 2 majors + 3 distinct minors, all valid. */
export function isValidStartingSkills(majorIds: string[], minorIds: string[]): boolean {
  if (majorIds.length !== START_MAJOR_COUNT || minorIds.length !== START_MINOR_COUNT) return false;
  const all = [...majorIds, ...minorIds];
  if (new Set(all).size !== all.length) return false;
  return all.every((id) => SKILL_BY_ID.has(id));
}

export type StartTier = 'base' | 'minor' | 'major';

export interface StartingSkillPick {
  majors: string[];
  minors: string[];
}

/** Which starting tier a skill currently holds in a pick. */
export function startingSkillState(pick: StartingSkillPick, skillId: string): StartTier {
  if (pick.majors.includes(skillId)) return 'major';
  if (pick.minors.includes(skillId)) return 'minor';
  return 'base';
}

/**
 * Cycle a skill base → minor → major → base for the creator picker, respecting
 * the caps (2 majors, 3 minors). When a cap blocks the next step it advances to
 * the next legal state (or back to base). Pure.
 */
export function toggleStartingSkill(pick: StartingSkillPick, skillId: string): StartingSkillPick {
  const inMajor = pick.majors.includes(skillId);
  const inMinor = pick.minors.includes(skillId);
  let majors = pick.majors.filter((id) => id !== skillId);
  let minors = pick.minors.filter((id) => id !== skillId);

  if (inMajor) {
    // major → base (already removed)
  } else if (inMinor) {
    // minor → major (if room), else base
    if (majors.length < START_MAJOR_COUNT) majors = [...majors, skillId];
  } else {
    // base → minor (if room), else major (if room), else stay base
    if (minors.length < START_MINOR_COUNT) minors = [...minors, skillId];
    else if (majors.length < START_MAJOR_COUNT) majors = [...majors, skillId];
  }
  return { majors, minors };
}

/** Apply the starting skill allocation: majors 40%, minors 20%, the rest 10%. */
export function allocateStartingSkills(
  stats: CharacterStats, majorIds: string[], minorIds: string[]
): CharacterStats {
  const skills: Record<string, number> = {};
  SKILLS.forEach((s) => {
    skills[s.id] = majorIds.includes(s.id) ? SKILL_MAJOR
      : minorIds.includes(s.id) ? SKILL_MINOR
      : SKILL_BASE;
  });
  return { ...stats, skills };
}

/**
 * Learning by doing: using a skill nudges the skill AND its parent attribute by
 * USE_GAIN × multiplier, capped at 100. Unknown skill → unchanged.
 */
export function applySkillUse(stats: CharacterStats, skillId: string, multiplier = 1): CharacterStats {
  const def = SKILL_BY_ID.get(skillId);
  if (!def) return stats;
  const gain = USE_GAIN * multiplier;
  const skills = { ...stats.skills, [skillId]: clamp((stats.skills[skillId] ?? SKILL_BASE) + gain) };
  const attributes = {
    ...stats.attributes,
    [def.attribute]: clamp(stats.attributes[def.attribute] + gain),
  };
  return { ...stats, attributes, skills };
}

// ─── Perks (unlock + choice) ─────────────────────────────────────────────────

/** How many tiers (0..PERK_TIERS) an attribute value has unlocked. */
export function unlockedTierCount(attrValue: number): number {
  return Math.min(PERK_TIERS, Math.max(0, Math.floor(attrValue / PERK_TIER_STEP)));
}

/** The chosen perk id for a given (attribute, tier) slot, if any. */
export function chosenPerkAt(stats: CharacterStats, attr: AttributeId, tier: number): string | null {
  return stats.perks.find((id) => {
    const p = PERK_BY_ID.get(id);
    return p?.attribute === attr && p.tier === tier;
  }) ?? null;
}

/** Unlocked-but-unfilled perk slots (one per tier per attribute). */
export function pendingPerkSlots(stats: CharacterStats): Array<{ attribute: AttributeId; tier: number }> {
  const out: Array<{ attribute: AttributeId; tier: number }> = [];
  ATTRIBUTES.forEach((a) => {
    const tiers = unlockedTierCount(stats.attributes[a.id]);
    for (let t = 1; t <= tiers; t++) {
      if (!chosenPerkAt(stats, a.id, t)) out.push({ attribute: a.id, tier: t });
    }
  });
  return out;
}

/** True when this perk can be chosen now: exists, unpicked, tier unlocked, slot free. */
export function canChoosePerk(stats: CharacterStats, perkId: string): boolean {
  const perk = PERK_BY_ID.get(perkId);
  if (!perk) return false;
  if (stats.perks.includes(perkId)) return false;
  if (perk.tier > unlockedTierCount(stats.attributes[perk.attribute])) return false;
  return chosenPerkAt(stats, perk.attribute, perk.tier) === null;
}

/** Choose a perk (returns a new sheet); a no-op if the choice is invalid. */
export function choosePerk(stats: CharacterStats, perkId: string): CharacterStats {
  if (!canChoosePerk(stats, perkId)) return stats;
  return { ...stats, perks: [...stats.perks, perkId] };
}

/**
 * Pick a perk for its (attribute, tier) slot, REPLACING any perk already chosen
 * in that slot — used by the creator so the player can switch their choice. A
 * no-op if the perk is unknown or its tier is still locked.
 */
export function choosePerkReplacing(stats: CharacterStats, perkId: string): CharacterStats {
  const perk = PERK_BY_ID.get(perkId);
  if (!perk) return stats;
  if (perk.tier > unlockedTierCount(stats.attributes[perk.attribute])) return stats;
  const existing = chosenPerkAt(stats, perk.attribute, perk.tier);
  const perks = existing ? stats.perks.filter((id) => id !== existing) : stats.perks;
  if (perks.includes(perkId)) return { ...stats, perks };
  return { ...stats, perks: [...perks, perkId] };
}

// ─── Check value selection (skill-fits → skill, else attribute fallback) ──────

/**
 * The percentage value a check rolls against: the SKILL% when the action clearly
 * fits a skill, else the governing ATTRIBUTE% (fallback). The decision of WHICH
 * skill/attribute fits is made upstream (the Phase 4 classifier); this just reads
 * the value. Pass `skillId = null` to force the attribute fallback.
 */
export function checkValue(stats: CharacterStats, skillId: string | null, attribute: AttributeId): number {
  if (skillId) {
    const def = SKILL_BY_ID.get(skillId);
    if (def) return stats.skills[skillId] ?? SKILL_BASE;
  }
  return stats.attributes[attribute];
}

// ─── Perk points (19D) ────────────────────────────────────────────────────────

/**
 * Compare two stat snapshots and return perk points to grant for each attribute
 * whose value crossed a 20-point threshold going upward (tiers 2–5 only; tier 1
 * is free at character creation).
 */
export function detectPerkPointGrants(
  before: CharacterStats,
  after: CharacterStats,
): Partial<Record<AttributeId, number>> {
  const grants: Partial<Record<AttributeId, number>> = {};
  for (const a of ATTRIBUTES) {
    const prevTierAbove1 = Math.max(0, Math.min(Math.floor(before.attributes[a.id] / PERK_TIER_STEP), PERK_TIERS) - 1);
    const newTierAbove1 = Math.max(0, Math.min(Math.floor(after.attributes[a.id] / PERK_TIER_STEP), PERK_TIERS) - 1);
    const crossed = newTierAbove1 - prevTierAbove1;
    if (crossed > 0) grants[a.id] = crossed;
  }
  return grants;
}

/** Apply a perk-point grant to a stats sheet (returns a new sheet). */
export function grantPerkPoints(
  stats: CharacterStats,
  grants: Partial<Record<AttributeId, number>>,
): CharacterStats {
  if (Object.keys(grants).length === 0) return stats;
  const perkPoints = { ...stats.perkPoints };
  for (const [attr, n] of Object.entries(grants) as [AttributeId, number][]) {
    perkPoints[attr] = (perkPoints[attr] ?? 0) + n;
  }
  return { ...stats, perkPoints };
}

/**
 * Spend a perk point to pick a perk in-game (K-screen). Returns updated stats or
 * null if the pick is invalid: perk unknown, no point for that attribute, tier
 * locked, perk already chosen, or slot already filled for that tier.
 */
export function pickPerk(perkId: string, stats: CharacterStats): CharacterStats | null {
  const perk = PERK_BY_ID.get(perkId);
  if (!perk) return null;
  const points = stats.perkPoints?.[perk.attribute] ?? 0;
  if (points <= 0) return null;
  if (perk.tier > unlockedTierCount(stats.attributes[perk.attribute])) return null;
  if (stats.perks.includes(perkId)) return null;
  if (chosenPerkAt(stats, perk.attribute, perk.tier) !== null) return null;
  const perkPoints = { ...stats.perkPoints, [perk.attribute]: points - 1 };
  return { ...stats, perks: [...stats.perks, perkId], perkPoints };
}

/** Total unspent perk points across all attributes. */
export function totalPerkPoints(stats: CharacterStats): number {
  return Object.values(stats.perkPoints ?? {}).reduce((s, n) => s + (n ?? 0), 0);
}
