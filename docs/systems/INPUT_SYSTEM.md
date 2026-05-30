# Input System

## Overview

Handles keyboard and (future) gamepad input. Maps raw input to semantic game actions. No scene code should read raw keys — it subscribes to action events via EventBus.

---

## Action Map

| Action | Default Key | Description |
|---|---|---|
| `move.forward` | W / ↑ | Move forward (camera-relative) |
| `move.backward` | S / ↓ | Move backward |
| `move.left` | A / ← | Strafe left |
| `move.right` | D / → | Strafe right |
| `move.sprint` | Shift (hold) | Sprint modifier |
| `interact` | E | Interact with nearest target |
| `camera.rotateLeft` | Q | Rotate world 45° CCW |
| `camera.rotateRight` | E (when no target) | Rotate world 45° CW |
| `camera.zoomIn` | Scroll Up | Zoom camera in |
| `camera.zoomOut` | Scroll Down | Zoom camera out |
| `vehicle.enter` | F | Enter/exit vehicle |
| `vehicle.ascend` | Space (in vehicle) | Ascend |
| `vehicle.descend` | Ctrl (in vehicle) | Descend |
| `pause` | Escape | Open pause menu |
| `dialog.open` | E (near NPC) | Open dialog input |

---

## Architecture

```typescript
class InputSystem {
  private actionStates: Map<string, boolean>;
  private axisValues: Map<string, number>;

  initialize(canvas: HTMLCanvasElement): void;
  isActionPressed(action: string): boolean;
  isActionJustPressed(action: string): boolean;
  getAxis(axis: string): number;       // -1 to 1
  update(): void;                       // called each frame
  dispose(): void;
}
```

---

## Context-Aware Bindings

Some keys have different meanings depending on game state:
- `E` → Interact when near interactable, Dialog when near NPC, Rotate when no target
- `Space` → Jump (future) when on foot, Ascend when in vehicle

The InputSystem emits raw events; the active scene decides what they mean.
