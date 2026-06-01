import {
  stepDog, DogState, DOG_BOUNDS, DOG_SPEED, DOG_SPAWNS, BEGGAR_SPOTS, TRASH_SPOTS,
} from '@entities/AmbientLife';

const b = { minX: -10, maxX: 10, minZ: -5, maxZ: 5 };

describe('stepDog', () => {
  it('advances forward along its heading while moving (no state change)', () => {
    // rand high → no toggle/re-aim; heading 0 → moves +Z.
    const d: DogState = { x: 0, z: 0, heading: 0, moving: true };
    const next = stepDog(d, 1, b, () => 0.9);
    expect(next.z).toBeCloseTo(DOG_SPEED, 5);
    expect(next.x).toBeCloseTo(0, 5);
    expect(next.moving).toBe(true);
  });

  it('does not move while idle', () => {
    const d: DogState = { x: 1, z: 2, heading: 1, moving: false };
    const next = stepDog(d, 1, b, () => 0.9);
    expect(next).toEqual({ x: 1, z: 2, heading: 1, moving: false });
  });

  it('toggles state and re-aims when the random roll is low', () => {
    const d: DogState = { x: 0, z: 0, heading: 0, moving: false };
    // rand=0 → toggle to moving, heading = 0*2π = 0
    const next = stepDog(d, 1, b, () => 0);
    expect(next.moving).toBe(true);
  });

  it('reflects off an X wall (heading → −heading) and stays in bounds', () => {
    const d: DogState = { x: 9.9, z: 0, heading: Math.PI / 2, moving: true }; // +X
    const next = stepDog(d, 1, b, () => 0.9);
    expect(next.x).toBeLessThanOrEqual(b.maxX);
    expect(next.x).toBe(b.maxX);
    expect(next.heading).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('reflects off a Z wall (heading → π − heading) and stays in bounds', () => {
    const d: DogState = { x: 0, z: 4.9, heading: 0, moving: true }; // +Z
    const next = stepDog(d, 1, b, () => 0.9);
    expect(next.z).toBe(b.maxZ);
    expect(next.heading).toBeCloseTo(Math.PI, 5);
  });

  it('keeps strays inside the street bounds over many steps', () => {
    let d: DogState = { x: 0, z: 0, heading: 0.7, moving: true };
    let r = 0.123;
    const rand = () => { r = (r * 9301 + 49297) % 233280 / 233280; return r; };
    for (let i = 0; i < 500; i++) {
      d = stepDog(d, 0.1, DOG_BOUNDS, rand);
      expect(d.x).toBeGreaterThanOrEqual(DOG_BOUNDS.minX - 0.01);
      expect(d.x).toBeLessThanOrEqual(DOG_BOUNDS.maxX + 0.01);
      expect(d.z).toBeGreaterThanOrEqual(DOG_BOUNDS.minZ - 0.01);
      expect(d.z).toBeLessThanOrEqual(DOG_BOUNDS.maxZ + 0.01);
    }
  });
});

describe('placement data', () => {
  it('spawns one lone stray dog with a valid model', () => {
    expect(DOG_SPAWNS).toHaveLength(1);
    DOG_SPAWNS.forEach((s) => expect(['shibainu', 'husky']).toContain(s.model));
  });

  it('beggars and trash have placement entries', () => {
    expect(BEGGAR_SPOTS.length).toBeGreaterThan(0);
    expect(TRASH_SPOTS.length).toBeGreaterThan(0);
    TRASH_SPOTS.forEach((t) => expect(t.size).toBeGreaterThan(0));
  });

  it('dog spawns start within the wander bounds', () => {
    DOG_SPAWNS.forEach(({ state }) => {
      expect(state.x).toBeGreaterThanOrEqual(DOG_BOUNDS.minX);
      expect(state.x).toBeLessThanOrEqual(DOG_BOUNDS.maxX);
      expect(state.z).toBeGreaterThanOrEqual(DOG_BOUNDS.minZ);
      expect(state.z).toBeLessThanOrEqual(DOG_BOUNDS.maxZ);
    });
  });
});
