# Vehicle System Design

## Overview

Vehicles in NeoBeiraRio include flying cars and flying Harley Davidson-style motorcycles. Players can enter, drive, and exit vehicles in the open world.

> **Implementation status (Phase 9 MVP — this cycle).** One vehicle (flying motorcycle)
> is playable. Decisions confirmed with the owner: **simplified lift/drag flight** model
> + **MVP-first** scope; procedural placeholder mesh (no GLB yet).
> - `VehicleController` — pure `computeFlightStep` (camera-relative thrust + lift, drag,
>   capped horizontal speed, altitude clamp). **F** mounts/dismounts; **Space/Ctrl** =
>   altitude; camera switches to a wider, laggier "vehicle mode".
> - **Damage/health** (shared `entities/Health.ts`): dismounting mid-air drops the hero
>   (gravity + fall damage); an **unpiloted bike free-falls** (engine off → no vertical
>   drag) and crashes → impact damage; **≤30% HP smokes**, **0 HP explodes** into an
>   unmountable wreck. Bike `{health, destroyed}` is persisted in `SaveGame`.
> - **Deferred:** flying car; ambient/scripted traffic; persisting the parked vehicle
>   *position* (HP + destroyed persist; position resets to the spawn dock on load).
> - Tuning: `DEFAULT_VEHICLE_CONFIG` (thrust/drag/hoverHeight/safeImpactSpeed/…).
> - Files: `entities/VehicleController.ts`, `entities/Health.ts`, wired in
>   `scenes/GameWorldScene.ts` + `systems/WorldHud.ts` (bike status).

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
