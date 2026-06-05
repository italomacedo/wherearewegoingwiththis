/**
 * Engineering crafting + sabotage math (Fase 20H, pure + tested).
 *
 * Crafting builds the EXISTING melee weapons from scrap (owner's call — no new
 * item types this phase). Sabotage damage is derived from the rigged weapon's
 * base damage. No engine deps; the scene consumes these helpers.
 */

/** Scrap cost to craft each existing melee weapon (gated by an Engenharia check). */
export const SCRAP_PER_WEAPON: Readonly<Record<string, number>> = Object.freeze({
  knife: 2,
  pipe: 2,
  bat: 3,
  shovel: 3,
  axe: 4,
});

/** The craftable weapon ids (the existing melee weapons). */
export function craftableWeapons(): string[] {
  return Object.keys(SCRAP_PER_WEAPON);
}

/** Scrap cost for a weapon, or null if it isn't craftable. */
export function scrapCostFor(weaponId: string): number | null {
  return SCRAP_PER_WEAPON[weaponId] ?? null;
}

/** Keyword → weapon id, for parsing which weapon the player wants to craft. */
const CRAFT_KEYWORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(faca|knife|blade)\b/i, 'knife'],
  [/\b(cano|pipe)\b/i, 'pipe'],
  [/\b(taco|bat)\b/i, 'bat'],
  [/\b(machado|axe|hatchet)\b/i, 'axe'],
  // 'pá'/'pa' anchored with lookarounds (\b is unreliable around the accented 'á').
  [/\bshovel\b|\bspade\b|(?<![a-zà-ú])p[áa](?![a-zà-ú])/i, 'shovel'],
];

/** Which weapon the player's craft emote refers to (defaults to the cheapest: knife). */
export function craftTargetFromText(text: string): string {
  for (const [re, id] of CRAFT_KEYWORDS) if (re.test(text)) return id;
  return 'knife';
}

/** Damage a sabotaged weapon deals to its wielder when it blows (1.5× its base). */
export function sabotageDamage(weaponDamageBase: number): number {
  return Math.max(1, Math.round(weaponDamageBase * 1.5));
}
