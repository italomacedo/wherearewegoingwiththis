import { InputSystem, DEFAULT_BINDINGS } from '../../../src/systems/InputSystem';

describe('InputSystem', () => {
  let input: InputSystem;

  beforeEach(() => {
    input = new InputSystem();
  });

  it('starts with no active actions', () => {
    expect(input.isActionActive('move.forward')).toBe(false);
  });

  it('handleKeyDown activates the bound action', () => {
    input.handleKeyDown('KeyW');
    expect(input.isActionActive('move.forward')).toBe(true);
  });

  it('handleKeyUp deactivates the action', () => {
    input.handleKeyDown('KeyW');
    input.handleKeyUp('KeyW');
    expect(input.isActionActive('move.forward')).toBe(false);
  });

  it('ignores unbound keys', () => {
    expect(() => input.handleKeyDown('KeyZ')).not.toThrow();
    expect(() => input.handleKeyUp('KeyZ')).not.toThrow();
  });

  it('arrow keys map to movement', () => {
    input.handleKeyDown('ArrowUp');
    expect(input.isActionActive('move.forward')).toBe(true);
  });

  // ─── Movement axis ──────────────────────────────────────────────────────

  it('getMovementAxis returns zero when nothing pressed', () => {
    expect(input.getMovementAxis()).toEqual({ x: 0, z: 0 });
  });

  it('forward gives z = 1', () => {
    input.handleKeyDown('KeyW');
    expect(input.getMovementAxis()).toEqual({ x: 0, z: 1 });
  });

  it('backward gives z = -1', () => {
    input.handleKeyDown('KeyS');
    expect(input.getMovementAxis()).toEqual({ x: 0, z: -1 });
  });

  it('right gives x = 1', () => {
    input.handleKeyDown('KeyD');
    expect(input.getMovementAxis()).toEqual({ x: 1, z: 0 });
  });

  it('left gives x = -1', () => {
    input.handleKeyDown('KeyA');
    expect(input.getMovementAxis()).toEqual({ x: -1, z: 0 });
  });

  it('opposite keys cancel out', () => {
    input.handleKeyDown('KeyW');
    input.handleKeyDown('KeyS');
    expect(input.getMovementAxis()).toEqual({ x: 0, z: 0 });
  });

  it('diagonal movement is normalized to length <= 1', () => {
    input.handleKeyDown('KeyW');
    input.handleKeyDown('KeyD');
    const axis = input.getMovementAxis();
    const len = Math.hypot(axis.x, axis.z);
    expect(len).toBeCloseTo(1, 5);
  });

  // ─── Sprint ─────────────────────────────────────────────────────────────

  it('isSprinting reflects shift', () => {
    expect(input.isSprinting()).toBe(false);
    input.handleKeyDown('ShiftLeft');
    expect(input.isSprinting()).toBe(true);
  });

  // ─── Just-pressed ───────────────────────────────────────────────────────

  it('wasJustPressed is true on first press', () => {
    input.handleKeyDown('KeyE');
    expect(input.wasJustPressed('interact')).toBe(true);
  });

  it('wasJustPressed is false after endFrame', () => {
    input.handleKeyDown('KeyE');
    input.endFrame();
    expect(input.wasJustPressed('interact')).toBe(false);
  });

  it('wasJustPressed does not retrigger on held key', () => {
    input.handleKeyDown('KeyE');
    input.endFrame();
    input.handleKeyDown('KeyE'); // still held — repeat event
    expect(input.wasJustPressed('interact')).toBe(false);
  });

  it('wasJustPressed retriggers after release and re-press', () => {
    input.handleKeyDown('KeyE');
    input.endFrame();
    input.handleKeyUp('KeyE');
    input.handleKeyDown('KeyE');
    expect(input.wasJustPressed('interact')).toBe(true);
  });

  // ─── Reset ──────────────────────────────────────────────────────────────

  it('reset clears all state', () => {
    input.handleKeyDown('KeyW');
    input.handleKeyDown('KeyE');
    input.reset();
    expect(input.isActionActive('move.forward')).toBe(false);
    expect(input.wasJustPressed('interact')).toBe(false);
  });

  // ─── Custom bindings ────────────────────────────────────────────────────

  it('accepts custom bindings', () => {
    const custom = new InputSystem({ Space: 'interact' });
    custom.handleKeyDown('Space');
    expect(custom.isActionActive('interact')).toBe(true);
  });

  it('DEFAULT_BINDINGS maps WASD and arrows', () => {
    expect(DEFAULT_BINDINGS.KeyW).toBe('move.forward');
    expect(DEFAULT_BINDINGS.ArrowLeft).toBe('move.left');
    expect(DEFAULT_BINDINGS.Escape).toBe('pause');
  });

  it('attach returns a detach function in Node (no-op)', () => {
    const detach = input.attach();
    expect(typeof detach).toBe('function');
    expect(() => detach()).not.toThrow();
  });
});
