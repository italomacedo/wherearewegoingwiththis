import {
  SCRAP_PER_WEAPON, craftableWeapons, scrapCostFor, craftTargetFromText, sabotageDamage,
} from '../../../../src/systems/skills/Crafting';

describe('Crafting (pure)', () => {
  it('lists the existing melee weapons as craftable', () => {
    expect(craftableWeapons().sort()).toEqual(['axe', 'bat', 'knife', 'pipe', 'shovel']);
  });

  it('scrapCostFor returns the cost, or null for non-craftables', () => {
    expect(scrapCostFor('knife')).toBe(SCRAP_PER_WEAPON.knife);
    expect(scrapCostFor('axe')).toBe(4);
    expect(scrapCostFor('pistol')).toBeNull();
  });

  it('craftTargetFromText matches EN/PT keywords, defaulting to knife', () => {
    expect(craftTargetFromText('*forjo um machado com a sucata*')).toBe('axe');
    expect(craftTargetFromText('*I weld a pipe together*')).toBe('pipe');
    expect(craftTargetFromText('*improviso uma pá*')).toBe('shovel');
    expect(craftTargetFromText('*craft a bat*')).toBe('bat');
    expect(craftTargetFromText('*monto uma arma qualquer*')).toBe('knife'); // default
  });

  it('sabotageDamage is 1.5× the base, floored at 1', () => {
    expect(sabotageDamage(12)).toBe(18);
    expect(sabotageDamage(0)).toBe(1);
  });
});
