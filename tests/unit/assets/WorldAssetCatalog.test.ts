import {
  WorldProp, ZONE_HALF, facingCenter, MERCADO_PROPS, NAVE_MODEL, VENDOR_SPOT,
  EXIT_WALL, CORRIDOR_COLLIDERS, COMBAT_OBSTACLES, COMBAT_BOUNDS,
  MOLD_SCALE, MOLD_NATIVE_WIDTH, moldBasename, moldScaleFor, scaleWidth, doorPlacementForSlot, DOOR_MODELS,
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

describe('WorldAssetCatalog — per-mold scale (pure)', () => {
  it('moldBasename strips directory and .glb', () => {
    expect(moldBasename('world/downtown/building_large_2.glb')).toBe('building_large_2');
    expect(moldBasename('building_small_1.glb')).toBe('building_small_1');
    expect(moldBasename('plain')).toBe('plain');
  });

  it('moldScaleFor returns the table value, default 1 for unknown molds', () => {
    expect(moldScaleFor('world/downtown/building_large_2.glb')).toBe(MOLD_SCALE.building_large_2);
    expect(moldScaleFor('world/nature/commontree_1.glb')).toBe(1);
    expect(moldScaleFor('totally_unknown.glb')).toBe(1);
  });

  it('every lining/dead-end building uses its per-mold scale', () => {
    // Backdrop buildings (bld-back-*) are a separate kit kept at a literal scale.
    const slotted = MERCADO_PROPS.filter((p) => /^bld-/.test(p.key) && !/^bld-back-/.test(p.key));
    expect(slotted.length).toBeGreaterThan(0);
    for (const b of slotted) expect(b.scale).toBe(moldScaleFor(b.model));
  });

  it('keeps each mold within the no-overlap width budget (≤14u slot spacing)', () => {
    // Final world width = X-scale × measured native width. It must stay under the 14u slot
    // spacing so neighbouring buildings never overlap (per-axis molds use their X only, so a
    // taller-via-Y building doesn't widen). Targeting ~13-14u leaves a small gap.
    for (const mold of Object.keys(MOLD_SCALE)) {
      const nativeWidth = MOLD_NATIVE_WIDTH[mold];
      expect(nativeWidth).toBeGreaterThan(0); // every scaled mold has a measured native width
      expect(scaleWidth(MOLD_SCALE[mold]) * nativeWidth).toBeLessThanOrEqual(14);
    }
  });
});

describe('WorldAssetCatalog — doorPlacementForSlot (pure)', () => {
  const NORTH = Math.PI;
  const SOUTH = 0;

  it('north slot: door X = slot.x + (openX+0.5)·scale, Z = slot.z + depth, rot π', () => {
    const d = doorPlacementForSlot({
      key: 'door-t', buildingModel: 'world/downtown/building_large_2.glb', doorModel: 'door_2',
      slotPos: [10, 0, 14], slotRotY: NORTH, finalScale: 2,
    });
    expect(d.position[0]).toBeCloseTo(10 + 0.5 * 2); // openX 0 + pivot 0.5, ×2
    expect(d.position[2]).toBeCloseTo(14 + 0.05);    // +DOOR_DEPTH
    expect(d.rotationY).toBe(NORTH);
    expect(d.scale).toBe(2);
    expect(d.model).toBe('world/downtown/door_2.glb');
  });

  it('south slot mirrors X and Z (− pivot, − depth), rot 0', () => {
    const d = doorPlacementForSlot({
      key: 'door-t', buildingModel: 'world/downtown/building_large_2.glb', doorModel: 'door_1',
      slotPos: [10, 0, -14], slotRotY: SOUTH, finalScale: 2,
    });
    expect(d.position[0]).toBeCloseTo(10 - 0.5 * 2);
    expect(d.position[2]).toBeCloseTo(-14 - 0.05);
    expect(d.rotationY).toBe(SOUTH);
  });

  it('building_small_1 raises the door onto its stoop (y = dy·scale)', () => {
    const d = doorPlacementForSlot({
      key: 'door-t', buildingModel: 'world/downtown/building_small_1.glb', doorModel: 'door_3',
      slotPos: [0, 0, 14], slotRotY: NORTH, finalScale: 2,
    });
    expect(d.position[1]).toBeCloseTo(1.0 * 2); // stoop dy 1.0 × scale
  });

  it('unknown building mold → centred door, no stoop', () => {
    const d = doorPlacementForSlot({
      key: 'door-t', buildingModel: 'mystery.glb', doorModel: 'door_1',
      slotPos: [5, 0, 14], slotRotY: NORTH, finalScale: 1,
    });
    expect(d.position[0]).toBeCloseTo(5 + 0.5);
    expect(d.position[1]).toBeCloseTo(0);
  });

  it('door models cycle through the three molds', () => {
    expect(DOOR_MODELS).toHaveLength(3);
    expect(DOOR_MODELS).toEqual(['door_1', 'door_2', 'door_3']);
  });

  it('per-axis scale: door uses X for the pivot, Y for the stoop, and inherits the scale', () => {
    const d = doorPlacementForSlot({
      key: 'door-t', buildingModel: 'world/downtown/building_small_1.glb', doorModel: 'door_1',
      slotPos: [0, 0, 14], slotRotY: NORTH, finalScale: [0.5, 0.8, 0.5],
    });
    expect(d.position[0]).toBeCloseTo(0 + 0.5 * 0.5); // pivot 0.5 × X-scale 0.5
    expect(d.position[1]).toBeCloseTo(1.0 * 0.8);     // stoop dy 1.0 × Y-scale 0.8
    expect(d.scale).toEqual([0.5, 0.8, 0.5]);         // door stretches with the building
  });
});

describe('WorldAssetCatalog — scaleWidth (pure)', () => {
  it('returns a uniform scale as-is and the X of a per-axis scale', () => {
    expect(scaleWidth(0.7)).toBe(0.7);
    expect(scaleWidth([0.67, 0.85, 0.67])).toBe(0.67);
  });
});
