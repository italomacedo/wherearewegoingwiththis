import {
  COCKPIT_TRANSFORM, COCKPIT_LAYOUT, DRIVER_HEAD_OFFSET, LCD_BANNER,
} from '../../../src/entities/VehicleCockpit';

describe('VehicleCockpit (pure layout + helpers)', () => {
  it('COCKPIT_TRANSFORM is the whole-unit placement (pos/rot/scale)', () => {
    expect(COCKPIT_TRANSFORM.pos).toHaveLength(3);
    expect(COCKPIT_TRANSFORM.rot).toHaveLength(3);
    expect(COCKPIT_TRANSFORM.scale).toBe(1);
  });

  it('COCKPIT_LAYOUT has the internal props (yoke at the origin) and is frozen', () => {
    for (const key of ['dashboard', 'column', 'yoke', 'lcd'] as const) {
      const t = COCKPIT_LAYOUT[key];
      expect(t.pos).toHaveLength(3);
      expect(t.rot).toHaveLength(3);
      expect(typeof t.scale).toBe('number');
    }
    expect(COCKPIT_LAYOUT.yoke.pos).toEqual([0, 0, 0]); // yoke is at the hands (root origin)
    expect(Object.isFrozen(COCKPIT_LAYOUT)).toBe(true);
  });

  it('DRIVER_HEAD_OFFSET is a sensible head height above the seat', () => {
    expect(DRIVER_HEAD_OFFSET.y).toBeGreaterThan(1); // above the seat (0.6)
  });

  it('LCD_BANNER names Roxane (the car agent)', () => {
    expect(LCD_BANNER).toContain('ROXANE');
  });
});
