# ADR-0008 — World Architecture: Zone/Chunk System

**Status:** Accepted
**Date:** 2026-05-30

## Context

The game is an open-world cyberpunk RPG. The world (NeoBeiraRio) is too large to hold in a single scene/memory at once. We need a structure that:
- Streams districts in/out on demand (memory + performance)
- Lets each district have its own terrain, props, lighting, NPCs, ambient audio
- Scales from 1 district (Phase 6 MVP) to many (Phase 10+)
- Keeps a clean spawn/teleport contract between districts
- Is testable headlessly (NullEngine), with procedural fallback when GLTF props are absent

## Decision

Adopt a **zone/chunk system**: the world is divided into discrete `WorldZone`s managed by a `ZoneManager`.

### WorldZone (abstract)

Each zone owns its content lifecycle:
```typescript
abstract class WorldZone {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract load(scene: Scene): Promise<void>;   // build terrain/props/lights
  abstract unload(): void;                        // dispose all zone meshes
  abstract getSpawnPoint(): Vector3;              // default player spawn
  getBounds(): { min: Vector3; max: Vector3 };    // walkable area
}
```

### ZoneManager (system)

Registers zone factories, loads the active zone, unloads the previous one. Lives in `ServiceLocator` and is shared across the GameWorldScene lifetime.
```typescript
class ZoneManager {
  register(id: string, factory: () => WorldZone): void;
  loadZone(id: string, scene: Scene): Promise<WorldZone>;
  getCurrentZone(): WorldZone | null;
  unloadCurrent(): void;
}
```

### Asset strategy per zone

Each zone uses the established pattern (see [ADR-0003](0003-character-modular-gltf.md)):
- `typeof document === 'undefined'` → procedural placeholder geometry (Node.js/Jest)
- Browser/Electron → load real GLTF props + Poly Haven PBR textures, falling back to procedural per-asset if the file is missing

This keeps tests at 95%+ coverage without touching the filesystem, while the shipped game uses real assets.

### Relationship to scenes

`GameWorldScene` (a Babylon `Scene`) is the container. The `ZoneManager` swaps `WorldZone` content *inside* that single scene — we do NOT create a new Babylon Scene per district. This keeps the player, camera, and HUD persistent across district transitions.

```
GameWorldScene (persistent Scene)
  ├── CameraSystem (persistent isometric camera)
  ├── Player (persistent)
  ├── HUD (persistent)
  └── ZoneManager.currentZone  ← swapped on district change
        └── MercadoSombrasZone (terrain + props + neon + rain + NPCs)
```

## Consequences

**Positive:**
- Open-world streaming foundation in place from Phase 6
- Each district is an isolated, independently-testable unit
- Player/camera/HUD survive district transitions (no reload flicker)
- Procedural fallback keeps CI green without asset files

**Negative:**
- More upfront structure than a single monolithic scene
- Zone transition logic (seams, loading screens for far districts) deferred to Phase 10+
- Memory budget per zone must be managed as districts grow

## Related

- [docs/design/WORLD_DESIGN.md](../design/WORLD_DESIGN.md) — district list and layout
- [docs/systems/CAMERA_SYSTEM.md](../systems/CAMERA_SYSTEM.md) — isometric camera
- [ADR-0001](0001-babylon-typescript.md) — Babylon.js engine
