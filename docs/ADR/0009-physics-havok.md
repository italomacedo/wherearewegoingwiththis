# ADR-0009 — Physics: Havok

**Status:** Accepted
**Date:** 2026-05-30

## Context

Phase 7 introduces the player character with movement and collision. Future phases
add flying vehicles (Phase 9) and combat with ragdolls/impacts (Phase 10). We need a
physics approach that:
- Handles player collision against world geometry
- Scales to vehicle dynamics and combat physics later
- Works in Electron/browser
- Does NOT break headless Jest tests (95% coverage requirement)

Options:
- **Babylon built-in collisions** (`moveWithCollisions` + ellipsoid) — light, no WASM,
  but no rigidbodies/forces/ragdolls
- **Havok** (`@babylonjs/havok`) — full physics engine (WASM), Babylon's first-class
  physics plugin, supports rigidbodies, constraints, ragdolls, vehicle dynamics

## Decision

Use **Havok** (`@babylonjs/havok`) as the physics engine from Phase 7 onward.

### Isolation from tests (critical)

Havok ships as a **WASM module** loaded asynchronously. It cannot run in the Jest
Node environment without significant setup, and we must not let it block CI.

Architecture rule: **physics integration is isolated behind `PhysicsService`, and all
gameplay math is pure and testable independent of the engine.**

```
PhysicsService
  init(scene): Promise<void>   // browser/Electron: load Havok WASM, enable plugin
                               // Node/Jest: no-op, isEnabled() stays false
  isEnabled(): boolean

PlayerController
  computeDisplacement(axis, sprint, cameraYaw, dt): Vector3   // PURE — fully tested
  update(dt)                                                   // applies displacement:
                                                               //   physics body (browser)
                                                               //   mesh.position (Node fallback)
```

- The movement direction, speed, sprint multiplier, and camera-relative rotation are
  computed by **pure functions** with 100% unit coverage.
- Havok WASM load + rigidbody creation are guarded by `typeof document !== 'undefined'`
  and `/* istanbul ignore */`, exactly like the GLTF/GUI browser paths in prior phases.
- Tests assert on `computeDisplacement` and on the Node fallback that moves
  `mesh.position` directly — never loading WASM.

### Why not start with built-in collisions

Switching engines later (built-in → Havok) would mean rewriting the player, vehicle,
and combat movement code mid-project. Committing to Havok now keeps one physics model
across all phases. The isolation rule above neutralizes Havok's only real downside
(test friction).

## Consequences

**Positive:**
- One physics model for player, vehicles, ragdolls, projectiles
- Rigidbody/constraint support ready for Phase 9 (flight) and Phase 10 (combat)
- Pure movement math keeps coverage at 100% without WASM in CI

**Negative:**
- Havok WASM adds ~1-2 MB to the bundle
- Physics tuning (mass, friction, damping) is more involved than ellipsoid collision
- Real collision behavior is only verifiable in the Electron smoke test, not in Jest

## Related

- [ADR-0001](0001-babylon-typescript.md) — Babylon.js engine
- [ADR-0007](0007-testing-strategy.md) — testing strategy / browser-path isolation
- [docs/systems/INPUT_SYSTEM.md](../systems/INPUT_SYSTEM.md) — input → movement axis
