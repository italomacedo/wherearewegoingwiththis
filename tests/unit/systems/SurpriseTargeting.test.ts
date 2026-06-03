import { withinRange, nearestToPoint, AimTarget } from '@systems/SurpriseTargeting';

describe('SurpriseTargeting (pure aim geometry)', () => {
  it('withinRange is inclusive at the edge', () => {
    expect(withinRange({ x: 0, z: 0 }, { x: 3, z: 4 }, 5)).toBe(true);  // dist 5 == range
    expect(withinRange({ x: 0, z: 0 }, { x: 3, z: 4 }, 4.9)).toBe(false);
    expect(withinRange({ x: 0, z: 0 }, { x: 1, z: 0 }, 1)).toBe(true);
  });

  it('nearestToPoint returns the closest target within the radius, else null', () => {
    const targets: AimTarget[] = [
      { id: 'a', pos: { x: 0, z: 0 } },
      { id: 'b', pos: { x: 10, z: 0 } },
      { id: 'c', pos: { x: 2, z: 0 } },
    ];
    expect(nearestToPoint(targets, { x: 1.6, z: 0 }, 2)!.id).toBe('c'); // 0.4 away
    expect(nearestToPoint(targets, { x: 0.1, z: 0 }, 2)!.id).toBe('a');
    expect(nearestToPoint(targets, { x: 50, z: 0 }, 2)).toBeNull();     // nothing in radius
    expect(nearestToPoint([], { x: 0, z: 0 }, 5)).toBeNull();
  });

  it('radius is exclusive (a target exactly at the radius does not qualify)', () => {
    const targets: AimTarget[] = [{ id: 'a', pos: { x: 2, z: 0 } }];
    expect(nearestToPoint(targets, { x: 0, z: 0 }, 2)).toBeNull(); // dist 2, radius 2 → out
    expect(nearestToPoint(targets, { x: 0, z: 0 }, 2.01)!.id).toBe('a');
  });
});
