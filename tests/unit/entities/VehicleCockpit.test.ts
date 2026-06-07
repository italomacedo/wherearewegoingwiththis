import {
  COCKPIT_TRANSFORM, COCKPIT_LAYOUT, DRIVER_HEAD_OFFSET, gaugePercents, LCD_BANNER,
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

  it('LCD_BANNER mentions the car agent (the future-agent seam)', () => {
    expect(LCD_BANNER).toContain('CAR AGENT');
  });

  it('gaugePercents normalizes speed/altitude to their max and health to 0..100%', () => {
    const g = gaugePercents(7, 14, 20, 40, 1);
    expect(g.spd).toBeCloseTo(50);
    expect(g.alt).toBeCloseTo(50);
    expect(g.hull).toBeCloseTo(100);
  });

  it('gaugePercents clamps over/under range and handles abs + zero max', () => {
    const over = gaugePercents(99, 14, 99, 40, 1.5);
    expect(over.spd).toBe(100);
    expect(over.alt).toBe(100);
    expect(over.hull).toBe(100);
    expect(gaugePercents(-7, 14, -5, 40, -0.2)).toEqual({ spd: 50, alt: 12.5, hull: 0 });
    expect(gaugePercents(5, 0, 5, 0, 0.5)).toEqual({ spd: 0, alt: 0, hull: 50 });
  });
});
