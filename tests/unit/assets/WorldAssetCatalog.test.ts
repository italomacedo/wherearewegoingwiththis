import {
  WorldProp, ZONE_HALF, facingCenter, MERCADO_PROPS, NAVE_MODEL, VENDOR_SPOT,
  EXIT_WALL, CORRIDOR_COLLIDERS, COMBAT_OBSTACLES, COMBAT_BOUNDS,
} from '../../../src/assets/WorldAssetCatalog';

const within = (p: WorldProp) =>
  Math.abs(p.position[0]) <= ZONE_HALF && Math.abs(p.position[2]) <= ZONE_HALF;
const byKey = (re: RegExp) => MERCADO_PROPS.filter((p) => re.test(p.key));

describe('WorldAssetCatalog — downtown city block (pure)', () => {
  it('every placement key is unique', () => {
    const keys = MERCADO_PROPS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every model path is a GLB under world/ or vehicles/', () => {
    for (const p of MERCADO_PROPS) expect(p.model).toMatch(/^(world|vehicles)\/.+\.glb$/);
  });

  it('every placement sits within the zone bounds', () => {
    for (const p of MERCADO_PROPS) expect(within(p)).toBe(true);
  });

  it('uses no separate road tiles — the lit ground plane is the asphalt', () => {
    // The MegaKit street tiles were dropped (directional + flat-normalled → gaps/black
    // under the glTF import wrapper). The zone's ground plane is the road surface.
    expect(byKey(/^road-\d+$/).length).toBe(0);
  });

  it('lines both sides of the street with buildings + a left dead end', () => {
    const lining = byKey(/^bld-[ns]-\d+$/);
    expect(lining.length).toBeGreaterThanOrEqual(4);
    // North-side buildings sit at +Z, south-side at −Z.
    expect(byKey(/^bld-n-\d+$/).every((b) => b.position[2] > 0)).toBe(true);
    expect(byKey(/^bld-s-\d+$/).every((b) => b.position[2] < 0)).toBe(true);
    const deadEnd = MERCADO_PROPS.find((p) => p.key === 'bld-deadend');
    expect(deadEnd).toBeDefined();
    expect(deadEnd!.position[0]).toBeLessThan(-20); // walls off the far-left end
  });

  it('includes sidewalks for the vendor calçada', () => {
    expect(byKey(/^sidewalk-/).length).toBeGreaterThan(0);
  });

  it('closes both sides + the dead end with backing walls', () => {
    expect(byKey(/^wall-(n|s)$/)).toHaveLength(2); // continuous side walls
    expect(MERCADO_PROPS.find((p) => p.key === 'wall-deadend')).toBeDefined();
  });

  it('puts a door on each lining building (+ dead end)', () => {
    const doors = byKey(/^door-/);
    expect(doors.length).toBeGreaterThanOrEqual(7); // 3 north + 3 south + dead end
    for (const d of doors) expect(d.model).toMatch(/door_\d\.glb$/);
  });

  it('defines a black exit wall at the +X end', () => {
    expect(EXIT_WALL.key).toBe('exit-wall');
    expect(EXIT_WALL.position[0]).toBeCloseTo(ZONE_HALF);
    expect(EXIT_WALL.size.every((s) => s > 0)).toBe(true);
  });

  it('defines a closed corridor of box colliders (2 sides + 2 ends)', () => {
    expect(CORRIDOR_COLLIDERS).toHaveLength(4);
    const keys = CORRIDOR_COLLIDERS.map((c) => c.key);
    expect(new Set(keys).size).toBe(4);
    for (const c of CORRIDOR_COLLIDERS) {
      expect(c.size.every((s) => s > 0)).toBe(true);
      expect(Math.abs(c.position[0])).toBeLessThanOrEqual(ZONE_HALF);
      expect(Math.abs(c.position[2])).toBeLessThanOrEqual(ZONE_HALF);
    }
    // The two side colliders are long along X; the two ends are long along Z.
    const sides = CORRIDOR_COLLIDERS.filter((c) => c.size[0] > c.size[2]);
    const ends = CORRIDOR_COLLIDERS.filter((c) => c.size[2] > c.size[0]);
    expect(sides).toHaveLength(2);
    expect(ends).toHaveLength(2);
  });

  it('exposes combat-movement obstacles (perimeter + exit wall) and arena bounds', () => {
    // Perimeter colliders + the exit wall, all with positive footprints.
    expect(COMBAT_OBSTACLES.length).toBe(CORRIDOR_COLLIDERS.length + 1);
    expect(COMBAT_OBSTACLES.some((o) => o.key === EXIT_WALL.key)).toBe(true);
    for (const o of COMBAT_OBSTACLES) expect(o.size[0] > 0 && o.size[2] > 0).toBe(true);
    // Bounds form a non-empty rectangle inside the zone.
    expect(COMBAT_BOUNDS.maxX).toBeGreaterThan(COMBAT_BOUNDS.minX);
    expect(COMBAT_BOUNDS.maxZ).toBeGreaterThan(COMBAT_BOUNDS.minZ);
    expect(COMBAT_BOUNDS.maxX).toBeLessThanOrEqual(ZONE_HALF);
  });

  it('includes street props and a sidewalk vendor stall with food', () => {
    expect(byKey(/^prop-/).length).toBeGreaterThan(0);
    expect(MERCADO_PROPS.find((p) => p.key === 'vendor-shelf')).toBeDefined();
    const food = byKey(/^vendor-food-/);
    expect(food.length).toBeGreaterThan(0);
    for (const f of food) {
      expect(f.position[1]).toBeGreaterThan(0); // rests on the shelf
      expect(f.scale).toBeLessThan(1);
    }
  });

  it('the vendor stall stands near Zara (VENDOR_SPOT)', () => {
    const shelf = MERCADO_PROPS.find((p) => p.key === 'vendor-shelf')!;
    const dist = Math.hypot(shelf.position[0] - VENDOR_SPOT[0], shelf.position[2] - VENDOR_SPOT[2]);
    expect(dist).toBeLessThan(6);
  });

  it('facingCenter points a prop toward the origin', () => {
    expect(facingCenter(0, -5)).toBeCloseTo(0);
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
