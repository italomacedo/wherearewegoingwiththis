# Camera System

## Overview

Isometric camera that follows the player with smooth damping. Supports rotation and zoom. Managed by `CameraSystem`.

> **Implementation notes (this cycle).**
> - **360° orbit** around the hero via **Z/C** (keyboard, continuous, `KEY_ORBIT_SPEED`)
>   and **middle-mouse drag** (native canvas listeners, `ORBIT_SENSITIVITY`).
> - **Camera-relative movement:** `getYaw()` returns `camera.alpha + π/2` — the direction
>   the camera *looks* (not the orbit angle of its *position*), so WASD points where the
>   camera faces (see CLAUDE.md Lesson 9).
> - **Follow without resetting orbit:** the follow updates `camera.target.copyFrom(...)`
>   (NOT `setTarget()`, which would recompute alpha/beta each frame and undo the orbit).
> - **Vehicle mode:** `enterVehicleMode/exitVehicleMode` widen the radius + lower damping.

---

## Configuration

```typescript
interface CameraConfig {
  targetElevationDeg: number;  // default 45°, range 30–60 (Options)
  rotationSnapDeg: number;     // 45° per Q/E press
  zoomMin: number;             // 10 units
  zoomMax: number;             // 50 units
  zoomDefault: number;         // 25 units
  followDamping: number;       // lerp factor, default 0.1
  vehicleZoomDefault: number;  // 60 units
  vehicleFollowDamping: number; // 0.05 (more lag at speed)
}
```

---

## Babylon.js Implementation

Uses `ArcRotateCamera` in a fixed-angle mode:

```typescript
const camera = new ArcRotateCamera('iso-cam', 
  Math.PI / 4,          // alpha (horizontal rotation)
  Math.PI / 4,          // beta (vertical — 45°)
  25,                   // radius (zoom)
  Vector3.Zero(),       // target
  scene
);
camera.lowerBetaLimit = Math.PI * (30/180);
camera.upperBetaLimit = Math.PI * (60/180);
camera.lowerRadiusLimit = 10;
camera.upperRadiusLimit = 50;
```

---

## Building Occlusion

When a building mesh is between camera and player:
- Set building material `alpha` to 0.3 (transparent)
- Reset to 1.0 when no longer occluding
- Use Babylon.js `AbstractMesh.isOccluded` or manual raycast
