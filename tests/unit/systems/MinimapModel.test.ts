import {
  buildMinimapView, MINIMAP_SIZE_PX, MINIMAP_RANGE_M, type MinimapParams,
} from '../../../src/systems/MinimapModel';
import { TILE_SIZE } from '../../../src/systems/world/WorldGrid';

const GREY: [number, number, number] = [0.2, 0.2, 0.2];

function params(over: Partial<MinimapParams> = {}): MinimapParams {
  return {
    px: 0, pz: 0, heading: 0, entities: [], themeColorAt: () => GREY, ...over,
  };
}

describe('MinimapModel.buildMinimapView (pure, heading-up)', () => {
  const radius = MINIMAP_SIZE_PX / 2;
  const scale = radius / MINIMAP_RANGE_M;

  it('an NPC straight ahead of a north-facing car shows above the centre (dy < 0)', () => {
    const v = buildMinimapView(params({ heading: 0, entities: [{ x: 0, z: 20 }] }));
    expect(v.dots).toHaveLength(1);
    expect(v.dots[0]!.dy).toBeLessThan(0); // up
    expect(Math.abs(v.dots[0]!.dx)).toBeCloseTo(0); // dead ahead
    expect(v.dots[0]!.dy).toBeCloseTo(-20 * scale);
  });

  it('the car\'s right (east, facing north) maps to +dx', () => {
    const v = buildMinimapView(params({ heading: 0, entities: [{ x: 20, z: 0 }] }));
    expect(v.dots[0]!.dx).toBeCloseTo(20 * scale);
    expect(v.dots[0]!.dy).toBeCloseTo(0);
  });

  it('North marker is straight up when facing north', () => {
    const v = buildMinimapView(params({ heading: 0 }));
    expect(v.north.dx).toBeCloseTo(0);
    expect(v.north.dy).toBeCloseTo(-radius); // top of the ring
  });

  it('facing east, North sits to the LEFT of the minimap', () => {
    const v = buildMinimapView(params({ heading: Math.PI / 2 }));
    expect(v.north.dx).toBeCloseTo(-radius); // left
    expect(v.north.dy).toBeCloseTo(0);
  });

  it('facing east, an NPC to the world-north shows on the left (dx < 0)', () => {
    const v = buildMinimapView(params({ heading: Math.PI / 2, entities: [{ x: 0, z: 20 }] }));
    expect(v.dots[0]!.dx).toBeLessThan(0);
    expect(Math.abs(v.dots[0]!.dy)).toBeCloseTo(0);
  });

  it('clamps an out-of-range NPC onto the ring (distance == radius)', () => {
    const v = buildMinimapView(params({ entities: [{ x: 0, z: MINIMAP_RANGE_M * 5 }] }));
    const d = Math.hypot(v.dots[0]!.dx, v.dots[0]!.dy);
    expect(d).toBeCloseTo(radius);
  });

  it('marks defeated NPCs as dead', () => {
    const v = buildMinimapView(params({ entities: [{ x: 5, z: 5, dead: true }] }));
    expect(v.dots[0]!.dead).toBe(true);
  });

  it('includes the player\'s own tile centred (a cell at the origin) and passes the theme color', () => {
    const v = buildMinimapView(params({ px: 0, pz: 0, themeColorAt: () => [0.3, 0.4, 0.5] }));
    const centerCell = v.cells.find((c) => Math.hypot(c.dx, c.dy) < 1e-6);
    expect(centerCell).toBeDefined();
    expect(centerCell!.color).toEqual([0.3, 0.4, 0.5]);
    expect(centerCell!.sizePx).toBeCloseTo(TILE_SIZE * scale);
  });

  it('rotation equals -heading (so world-axis cells stay aligned)', () => {
    const v = buildMinimapView(params({ heading: 0.7 }));
    expect(v.rotation).toBeCloseTo(-0.7);
  });

  it('passes the correct tile coords to themeColorAt for neighbouring tiles', () => {
    const seen = new Set<string>();
    buildMinimapView(params({ px: 0, pz: 0, themeColorAt: (tx, tz) => { seen.add(`${tx},${tz}`); return GREY; } }));
    expect(seen.has('0,0')).toBe(true); // player's tile
    expect(seen.has('1,0')).toBe(true); // east neighbour
    expect(seen.has('0,1')).toBe(true); // north neighbour
  });
});
