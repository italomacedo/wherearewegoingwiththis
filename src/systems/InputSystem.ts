export type GameAction =
  | 'move.forward'
  | 'move.backward'
  | 'move.left'
  | 'move.right'
  | 'move.sprint'
  | 'move.up'
  | 'move.down'
  | 'interact'
  | 'chat.open'
  | 'inventory.open'
  | 'adjust.toggle'
  | 'vehicle.enter'
  | 'camera.rotateLeft'
  | 'camera.rotateRight'
  | 'pause';

/** Default key code → action bindings (KeyboardEvent.code values). */
export const DEFAULT_BINDINGS: Record<string, GameAction> = {
  KeyW: 'move.forward',
  ArrowUp: 'move.forward',
  KeyS: 'move.backward',
  ArrowDown: 'move.backward',
  KeyA: 'move.left',
  ArrowLeft: 'move.left',
  KeyD: 'move.right',
  ArrowRight: 'move.right',
  ShiftLeft: 'move.sprint',
  ShiftRight: 'move.sprint',
  Space: 'move.up',
  ControlLeft: 'move.down',
  ControlRight: 'move.down',
  KeyE: 'interact',
  KeyT: 'chat.open', // open the chat anywhere (react to the world / hail an NPC)
  KeyI: 'inventory.open', // open the inventory overlay
  KeyO: 'adjust.toggle',  // open the held-prop Adjust tool (calibrate attach)
  KeyF: 'vehicle.enter',
  Escape: 'pause',
  // Camera orbit: hold Z / C to rotate left / right (also middle-mouse drag).
  KeyZ: 'camera.rotateLeft',
  KeyC: 'camera.rotateRight',
};

export interface MovementAxis {
  x: number; // -1 (left) .. 1 (right)
  z: number; // -1 (backward) .. 1 (forward)
}

/**
 * Maps raw keyboard input to semantic game actions and a movement axis.
 * Pure logic (handleKeyDown/Up, queries) is fully testable; window listener
 * wiring (attach/detach) is browser-only.
 */
export class InputSystem {
  private bindings: Record<string, GameAction>;
  private active = new Set<GameAction>();
  private justPressed = new Set<GameAction>();

  constructor(bindings: Record<string, GameAction> = DEFAULT_BINDINGS) {
    this.bindings = { ...bindings };
  }

  handleKeyDown(code: string): void {
    const action = this.bindings[code];
    if (!action) return;
    if (!this.active.has(action)) {
      this.justPressed.add(action);
    }
    this.active.add(action);
  }

  handleKeyUp(code: string): void {
    const action = this.bindings[code];
    if (!action) return;
    this.active.delete(action);
  }

  isActionActive(action: GameAction): boolean {
    return this.active.has(action);
  }

  /** True only on the first frame the action was pressed. Cleared by endFrame(). */
  wasJustPressed(action: GameAction): boolean {
    return this.justPressed.has(action);
  }

  /** Normalized movement axis from currently-held movement keys. */
  getMovementAxis(): MovementAxis {
    let x = 0;
    let z = 0;
    if (this.active.has('move.forward')) z += 1;
    if (this.active.has('move.backward')) z -= 1;
    if (this.active.has('move.right')) x += 1;
    if (this.active.has('move.left')) x -= 1;

    // Normalize diagonal so it isn't faster than cardinal movement
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  isSprinting(): boolean {
    return this.active.has('move.sprint');
  }

  /** Vertical flight axis: +1 ascend (up), -1 descend (down), 0 neither. */
  getVerticalAxis(): number {
    let y = 0;
    if (this.active.has('move.up')) y += 1;
    if (this.active.has('move.down')) y -= 1;
    return y;
  }

  /** Clears per-frame just-pressed state. Call at end of each frame. */
  endFrame(): void {
    this.justPressed.clear();
  }

  /** Clears all held/just-pressed state (e.g. on focus loss). */
  reset(): void {
    this.active.clear();
    this.justPressed.clear();
  }

  /** Wires window keyboard listeners (browser/Electron only). */
  /* istanbul ignore next — browser-only DOM wiring */
  attach(): () => void {
    if (typeof window === 'undefined') return () => {};
    const down = (e: KeyboardEvent) => this.handleKeyDown(e.code);
    const up = (e: KeyboardEvent) => this.handleKeyUp(e.code);
    const blur = () => this.reset();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }
}
