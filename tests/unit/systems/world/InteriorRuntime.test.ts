import {
  INTERIOR_ORIGIN, interiorWorldPos, doorTriggerHit, returnTrigger, interiorItemKey, sleepTriggerHit,
} from '@systems/world/InteriorRuntime';
import type { WorldDoorTrigger, WorldSleepTrigger } from '@systems/world/SceneDocToTile';

const door: WorldDoorTrigger = {
  key: 'q-plaza-2-2-bar_door',
  position: [120, 0, 140],
  size: [2, 3, 1],
  targetSceneId: 'bar',
  spawnPoint: [0, 0, -8],
};

describe('InteriorRuntime', () => {
  test('interiorWorldPos offsets by INTERIOR_ORIGIN', () => {
    expect(interiorWorldPos([1, 0.5, -2])).toEqual([
      INTERIOR_ORIGIN[0] + 1, 0.5, INTERIOR_ORIGIN[2] - 2,
    ]);
  });

  test('doorTriggerHit detects inside/outside the AABB (ground-anchored)', () => {
    expect(doorTriggerHit({ x: 120, y: 0.5, z: 140 }, [door])).toBe(door);
    expect(doorTriggerHit({ x: 120.9, y: 0, z: 140.4 }, [door])).toBe(door);
    expect(doorTriggerHit({ x: 121.2, y: 0, z: 140 }, [door])).toBeNull(); // past half-width
    expect(doorTriggerHit({ x: 120, y: 6, z: 140 }, [door])).toBeNull(); // way above
    expect(doorTriggerHit({ x: 120, y: 0, z: 141 }, [door])).toBeNull(); // past half-depth
    expect(doorTriggerHit({ x: 0, y: 0, z: 0 }, [])).toBeNull();
  });

  test('first matching trigger wins', () => {
    const other = { ...door, key: 'other', position: [120, 0, 140] as [number, number, number] };
    expect(doorTriggerHit({ x: 120, y: 0, z: 140 }, [other, door])).toBe(other);
  });

  test('returnTrigger sits at the interior spawn and sends back to the entry', () => {
    const ret = returnTrigger(door);
    expect(ret.key).toBe('return-q-plaza-2-2-bar_door');
    expect(ret.position).toEqual(interiorWorldPos([0, 0, -8]));
    expect(ret.targetSceneId).toBe('');
    expect(ret.spawnPoint).toEqual([120, 0, 140]);
  });

  test('interiorItemKey is stable per doc + index', () => {
    expect(interiorItemKey('bar', 2)).toBe('int:bar:2');
  });

  test('sleepTriggerHit detects inside/outside the bed AABB (ground-anchored)', () => {
    const bed: WorldSleepTrigger = { key: 'qbed-inn-0-0-b1', position: [10, 0, 20], size: [3, 2.5, 4] };
    expect(sleepTriggerHit({ x: 10, y: 0, z: 20 }, [bed])).toBe(bed);
    expect(sleepTriggerHit({ x: 11.4, y: 0.5, z: 21.9 }, [bed])).toBe(bed); // within half-extents
    expect(sleepTriggerHit({ x: 11.6, y: 0, z: 20 }, [bed])).toBeNull();    // past half-width
    expect(sleepTriggerHit({ x: 10, y: 0, z: 22.1 }, [bed])).toBeNull();    // past half-depth
    expect(sleepTriggerHit({ x: 10, y: 6, z: 20 }, [bed])).toBeNull();      // way above
    expect(sleepTriggerHit({ x: 0, y: 0, z: 0 }, [])).toBeNull();
  });
});
