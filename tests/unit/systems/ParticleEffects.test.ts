import { muzzleFlashConfig } from '@systems/ParticleEffects';

describe('muzzleFlashConfig', () => {
  it('is a brief, small burst (reads as a gunshot, not a fireball)', () => {
    const c = muzzleFlashConfig();
    expect(c.emitCount).toBeGreaterThan(0);
    expect(c.emitCount).toBeLessThanOrEqual(c.capacity); // burst fits the pool
    expect(c.maxLifeTime).toBeLessThan(0.2);             // very short-lived
    expect(c.minLifeTime).toBeLessThanOrEqual(c.maxLifeTime);
    expect(c.minSize).toBeLessThanOrEqual(c.maxSize);
    expect(c.minEmitPower).toBeLessThanOrEqual(c.maxEmitPower);
    expect(c.spread).toBeGreaterThan(0);
  });
});
