# Vehicle System Design

## Overview

Vehicles in NeoBeiraRio include flying cars and flying Harley Davidson-style motorcycles. Players can enter, drive, and exit vehicles in the open world.

---

## Vehicle Types (Phase 9)

| Type | Asset Target | Description |
|---|---|---|
| Flying Car | Sketchfab: "cyberpunk flying car glb" | 4-door, enclosed, slower/stable |
| Flying Harley | Sketchfab: "cyberpunk flying motorcycle" | 2-wheel anti-grav, faster/agile |

---

## Flight Physics Model

Simple but satisfying — not realistic simulation:

```
Horizontal: acceleration/deceleration with drag (feels like hovercraft)
Vertical:   altitude held by anti-grav (press Space to rise, Ctrl to descend)
Banking:    visual tilt on turns (no actual physics tilt)
Max speed:  car 80 units/s, motorcycle 120 units/s
Altitude:   0 (street) to 200 units (above tower tops)
```

---

## Controls (Vehicle Mode)

| Key | Action |
|---|---|
| WASD | Horizontal movement |
| Space | Ascend |
| Ctrl | Descend |
| Shift | Boost (motorcycle only) |
| F | Enter/Exit vehicle |
| Mouse | Look / aim direction |

---

## Camera (Vehicle Mode)

- Switches to wider `ArcRotateCamera` (more distant, higher angle)
- Follows vehicle with speed-based lag (faster = more lag for feel)
- Returns to standard isometric camera on exit

---

## Vehicle State

```typescript
interface VehicleState {
  id: string;
  type: 'car' | 'motorcycle';
  position: Vector3;
  velocity: Vector3;
  altitude: number;
  occupied: boolean;
  occupantId: string | null; // 'player' or NPC id
}
```

---

## Parked Vehicles

- Scattered through the world at fixed spawn points
- Player approaches (within 2m) → prompt "Press F to enter"
- On exit, vehicle stays where player left it (no disappearing)
