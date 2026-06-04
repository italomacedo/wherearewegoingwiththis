import {
  URBAN_FRAME, framePlanes, crosswalkStripes, manholeSpots, interiorBuildingSlots,
} from '@assets/world/CityFrame';
import { tileCenter } from '@systems/world/WorldGrid';
import { mulberry32 } from '@systems/world/SeededRng';

describe('CityFrame (pure)', () => {
  describe('framePlanes', () => {
    it('stacks asphalt(60) ▸ sidewalk(52) ▸ interior(44), centred on the tile', () => {
      const planes = framePlanes(0, 0);
      expect(planes.map((p) => p.kind)).toEqual(['asphalt', 'sidewalk', 'interior']);
      expect(planes[0].size).toEqual([60, 60]);
      expect(planes[1].size).toEqual([52, 52]);
      expect(planes[2].size).toEqual([44, 44]);
      // interior drawn above sidewalk above asphalt
      expect(planes[0].center[1]).toBeLessThan(planes[1].center[1]);
      expect(planes[1].center[1]).toBeLessThan(planes[2].center[1]);
    });
    it('positions planes at the tile world centre', () => {
      const [cx, , cz] = tileCenter(3, 5);
      for (const p of framePlanes(3, 5)) {
        expect(p.center[0]).toBe(cx);
        expect(p.center[2]).toBe(cz);
      }
    });
  });

  describe('crosswalkStripes', () => {
    const stripes = crosswalkStripes(0, 0);
    it('puts a crosswalk on each of the 4 edges', () => {
      for (const tag of ['n', 's', 'e', 'w']) {
        expect(stripes.some((s) => s.key.includes(`-${tag}-`))).toBe(true);
      }
    });
    it('lays bars on the road band (~±28) on the correct axis', () => {
      const n = stripes.filter((s) => s.key.includes('-n-'));
      expect(n.every((s) => Math.abs(s.center[2] - 28) < 0.001)).toBe(true); // z ≈ +28
      expect(n.every((s) => s.size[0] < s.size[1])).toBe(true);              // thin in x, long in z
      const e = stripes.filter((s) => s.key.includes('-e-'));
      expect(e.every((s) => Math.abs(s.center[0] - 28) < 0.001)).toBe(true); // x ≈ +28
      expect(e.every((s) => s.size[0] > s.size[1])).toBe(true);              // long in x, thin in z
    });
  });

  describe('manholeSpots', () => {
    it('is deterministic and lands on the asphalt road ring (|coord| ≥ roadInner)', () => {
      const a = manholeSpots(2, 2, mulberry32(5));
      const b = manholeSpots(2, 2, mulberry32(5));
      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThanOrEqual(2);
      const [cx, , cz] = tileCenter(2, 2);
      for (const [x, , z] of a) {
        const onRoad = Math.abs(x - cx) >= URBAN_FRAME.roadInner - 0.001 || Math.abs(z - cz) >= URBAN_FRAME.roadInner - 0.001;
        expect(onRoad).toBe(true);
      }
    });
  });

  describe('interiorBuildingSlots', () => {
    const slots = interiorBuildingSlots(0, 0);
    it('returns 6 slots, all inside the interior (|local| ≤ 22)', () => {
      expect(slots).toHaveLength(6);
      for (const s of slots) {
        expect(Math.abs(s.position[0])).toBeLessThanOrEqual(URBAN_FRAME.sidewalkInner);
        expect(Math.abs(s.position[2])).toBeLessThanOrEqual(URBAN_FRAME.sidewalkInner);
      }
    });
    it('slots do not overlap (centres ≥ footprint apart)', () => {
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const dx = Math.abs(slots[i].position[0] - slots[j].position[0]);
          const dz = Math.abs(slots[i].position[2] - slots[j].position[2]);
          expect(dx >= slots[i].footprint || dz >= slots[i].footprint).toBe(true);
        }
      }
    });
    it('north row faces -z (π), south row faces +z (0)', () => {
      expect(slots.filter((s) => s.key.includes('-n-')).every((s) => s.rotationY === Math.PI)).toBe(true);
      expect(slots.filter((s) => s.key.includes('-s-')).every((s) => s.rotationY === 0)).toBe(true);
    });
  });
});
