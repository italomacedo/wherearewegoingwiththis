import {
  WorldProp, ZONE_HALF, STALL_COORDS, facingCenter,
  MERCADO_STALLS, MERCADO_FOOD, MERCADO_BUILDINGS, MERCADO_PROPS, NAVE_MODEL,
} from '../../../src/assets/WorldAssetCatalog';

const within = (p: WorldProp) =>
  Math.abs(p.position[0]) <= ZONE_HALF && Math.abs(p.position[2]) <= ZONE_HALF;

describe('WorldAssetCatalog — Mercado das Sombras placements (pure)', () => {
  it('every placement key is unique', () => {
    const keys = MERCADO_PROPS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every model path is a GLB under world/ or vehicles/', () => {
    for (const p of MERCADO_PROPS) {
      expect(p.model).toMatch(/^(world|vehicles)\/.+\.glb$/);
    }
  });

  it('every placement sits within the zone bounds', () => {
    for (const p of MERCADO_PROPS) expect(within(p)).toBe(true);
  });

  it('has one shelf per stall slot, each replacing a procedural counter', () => {
    expect(MERCADO_STALLS).toHaveLength(STALL_COORDS.length);
    MERCADO_STALLS.forEach((s, i) => {
      expect(s.replaces).toBe(`stall-${i}`);
      expect(s.position).toEqual([STALL_COORDS[i]![0], 0, STALL_COORDS[i]![1]]);
      expect(Number.isFinite(s.rotationY)).toBe(true);
    });
  });

  it('places two food items per stall, resting above the shelf', () => {
    expect(MERCADO_FOOD).toHaveLength(STALL_COORDS.length * 2);
    for (const f of MERCADO_FOOD) {
      expect(f.position[1]).toBeGreaterThan(0);
      expect(f.scale).toBeLessThan(1); // food is downscaled
      expect(f.replaces).toBeUndefined(); // food adds, never replaces
    }
  });

  it('buildings are empty until Phase B', () => {
    expect(MERCADO_BUILDINGS).toHaveLength(0);
  });

  it('facingCenter points a prop toward the origin', () => {
    expect(Number.isFinite(facingCenter(-6, 6))).toBe(true);
    expect(facingCenter(0, -5)).toBeCloseTo(0); // on -z axis → already faces centre
    const a = facingCenter(6, 6);
    expect(a).toBeGreaterThanOrEqual(-Math.PI);
    expect(a).toBeLessThanOrEqual(Math.PI);
  });

  it('NAVE_MODEL describes a scaled GLB vehicle', () => {
    expect(NAVE_MODEL.path).toMatch(/^vehicles\/.+\.glb$/);
    expect(NAVE_MODEL.scale).toBeGreaterThan(0);
    expect(Number.isFinite(NAVE_MODEL.yaw)).toBe(true);
  });
});
