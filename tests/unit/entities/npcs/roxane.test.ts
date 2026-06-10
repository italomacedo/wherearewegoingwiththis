import { ROXANE_DEFINITION, createRoxane } from '@entities/npcs/roxane';

describe('Roxane definition', () => {
  it('is the car AI with the expected identity', () => {
    expect(ROXANE_DEFINITION.id).toBe('roxane_car_ai');
    expect(ROXANE_DEFINITION.name).toBe('Roxane');
    expect(ROXANE_DEFINITION.initialDisposition).toBe('friendly');
  });

  it('is bodyless — no avatar and no loadout (lives in the dashboard)', () => {
    expect(ROXANE_DEFINITION.appearance).toBeUndefined();
    expect(ROXANE_DEFINITION.loadout).toBeUndefined();
  });

  it('createRoxane returns a fresh copy with a cloned position', () => {
    const a = createRoxane();
    const b = createRoxane();
    expect(a).not.toBe(b);
    expect(a.position).not.toBe(ROXANE_DEFINITION.position);
    expect(a.position).toEqual([0, 0, 0]);
  });
});
