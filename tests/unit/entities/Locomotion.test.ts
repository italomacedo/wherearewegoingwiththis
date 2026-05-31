import { selectLocoState, IDLE_SPEED_EPSILON } from '../../../src/entities/Locomotion';

describe('selectLocoState', () => {
  it('idle when standing still', () => {
    expect(selectLocoState(0, false, false)).toBe('idle');
    expect(selectLocoState(IDLE_SPEED_EPSILON, false, false)).toBe('idle');
  });

  it('walk when moving without sprint', () => {
    expect(selectLocoState(3, false, false)).toBe('walk');
  });

  it('run when moving with sprint', () => {
    expect(selectLocoState(7, true, false)).toBe('run');
  });

  it('sprint while standing still is still idle', () => {
    expect(selectLocoState(0, true, false)).toBe('idle');
  });

  it('interact overrides movement', () => {
    expect(selectLocoState(8, true, true)).toBe('interact');
    expect(selectLocoState(0, false, true)).toBe('interact');
  });

  it('treats NaN / negative speed as idle', () => {
    expect(selectLocoState(NaN, false, false)).toBe('idle');
    expect(selectLocoState(-5, false, false)).toBe('idle');
  });
});
