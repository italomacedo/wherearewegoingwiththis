import { t } from '@systems/I18n';

/**
 * Pure formatter for the deterministic skill-check chat notice:
 * "Furtividade: 23 vs 65% — SUCCESS · CRITICAL". A mechanical, out-of-world
 * line (DialogSystem `system` role) — it states the roll outcome only, never
 * the world mutation (the narration handles flavour separately).
 */
export function checkLine(
  skillLabel: string,
  roll: number,
  probability: number,
  success: boolean,
  critical: boolean
): string {
  const outcome = success ? t('skill.checkSuccess') : t('skill.checkFailure');
  const crit = critical ? ` ${t('skill.checkCrit')}` : '';
  return t('skill.checkLine', {
    skill: skillLabel,
    roll: Math.round(roll),
    chance: Math.round(probability * 100),
    outcome: `${outcome}${crit}`,
  });
}
