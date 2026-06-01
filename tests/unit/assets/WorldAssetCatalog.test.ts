import {
  WorldProp, ZONE_HALF, facingCenter, MERCADO_PROPS, NAVE_MODEL, VENDOR_SPOT,
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

  it('has a 4-way intersection at the origin plus four road arms', () => {
    const inter = MERCADO_PROPS.find((p) => p.key === 'road-intersection');
    expect(inter).toBeDefined();
    expect(inter!.position).toEqual([0, 0, 0]);
    expect(inter!.model).toMatch(/intersection/);
    expect(byKey(/^road-[nsew]$/)).toHaveLength(4);
  });

  it('places a building on each of the four corner lots', () => {
    const corners = byKey(/^bld-(ne|nw|se|sw)$/);
    expect(corners).toHaveLength(4);
    for (const b of corners) {
      expect(b.model).toMatch(/^world\/downtown\/building_.+\.glb$/);
      expect(Math.abs(b.position[0])).toBeGreaterThan(12); // outside the intersection
    }
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
