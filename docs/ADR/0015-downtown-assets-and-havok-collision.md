# ADR-0015 — Downtown world assets (Quaternius CC0) + Havok collision

**Status:** Accepted · **Date:** 2026-06 · **Supersedes the "dormant assets" part of** gap #4

## Context

The game shipped zero `.glb`/textures — the first scene (Mercado das Sombras) was entirely
procedural primitives, and `MercadoSombrasZone.loadRealAssets` was a no-op. Earlier we believed
the coding agent could not acquire binary assets (no Sketchfab/PolyHaven MCP; `WebFetch` returns
text). The owner then supplied **Quaternius CC0 packs** (Downtown City MegaKit + Ultimate
Modular/Building/Spaceships/Food/Sci-Fi) locally, and **Blender is installed**, which sidesteps
that constraint: the agent converts user-provided source files locally. The owner also wanted the
first scene to read as a real **downtown street**, an NPC (Zara) avatar, and **real collision**.

## Decisions

1. **Asset pipeline = local Blender headless conversion.** `scripts/convert_assets.py`
   (`blender --background --python … -- <src> <out> [--fbx|--gltf] [--no-anim] [--maxtex N] [--names …]`)
   batch-converts FBX or glTF → GLB. It strips lights/cameras, **forces materials opaque**
   (FBX import brings base-colour alpha in as 0 → invisible), and `--maxtex` downscales textures
   (MegaKit ships 2K atlases that embed per-GLB → 16 models were ~290 MB; at 512 they're ~37 MB).
   Output lives under `public/assets/world/**` + `public/assets/vehicles/nave.glb`. Converted GLBs
   **are committed** (the source packs are not).

2. **Placement is pure data.** `src/assets/WorldAssetCatalog.ts` holds the entire downtown layout
   as plain, unit-tested data: `MERCADO_PROPS` (roads, sidewalks, buildings, doors, walls, vendor),
   `WorldProp { key, model, position, rotationY?, scale? }` (scale may be `[x,y,z]`), `EXIT_WALL`,
   `CORRIDOR_COLLIDERS` (perimeter AABBs), `NAVE_MODEL`. `MercadoSombrasZone.loadRealAssets`
   (browser-only) loads each GLB into a positioned `TransformNode` holder, hides the procedural
   market wholesale, and builds physics colliders. A missing/failed GLB keeps the procedural
   fallback (and headless tests never load GLBs).

3. **Layout = a closed linear street.** Continuous `street_asphalt_9x9` along X; sidewalks butted
   against the buildings; MegaKit buildings lining both ±Z sides with **doors** filling their
   openings (door X measured from each model's interior-floor mesh; pivot + π-rotation accounted
   for); brick perimeter walls close the gaps (becos); a **dead end** at −X and a **black exit
   wall** at +X (procedural; future scene-transition trigger). Zara is a `w_punk` Quaternius female
   avatar (idle) at a sidewalk vendor stall; the flying bike became a small **nave** (Ultimate
   Spaceships). Camera pulled close (near third-person).

4. **Collision = Havok `PhysicsCharacterController` + static box colliders.**
   - Havok WASM is served from `/public` (copied by `scripts/copy-havok-wasm.mjs`, `predev`/
     `prebuild` hooks) with `locateFile: () => '/HavokPhysics.wasm'` — the package `exports` map
     forbids a deep `?url` import, and the default path 404s to `index.html` (MIME error).
   - The hero is driven by a `PhysicsCharacterController` (collide-and-slide capsule) when physics
     is live; the kinematic path remains for headless tests.
   - The world is made solid with one invisible **BOX `PhysicsAggregate` (`mass:0`)** per perimeter
     wall (`CORRIDOR_COLLIDERS`), per **solid** prop/building (sized from the holder's world bounding
     box), the black exit wall, a **floor**, and the **nave + Zara**. Roads/sidewalks/food/manhole
     stay walkable. Physics is initialised **before** the zone+player so colliders/controller exist.

## Consequences

- The first scene is a coherent, collidable downtown V1 built entirely from CC0 assets; dropping/
  converting more Quaternius packs "just works" through the catalog + converter.
- All Havok/GLB/DOM code is guarded by `typeof document` / `isPhysicsEnabled()` + `istanbul ignore`;
  pure placement + collider data stay fully unit-tested. 623 tests green, coverage ≥95/90.
- **Deferred:** the +X exit wall actually transitioning to a second street; per-prop GLB instancing
  to cut texture duplication; packaged `file://` wasm path; dynamic/pushable rigidbodies; fall-damage
  re-derivation from the character controller (currently simplified).

## See also
Lessons 19–21 in `CLAUDE.md`; `scripts/convert_assets.py`, `src/assets/WorldAssetCatalog.ts`,
`src/entities/zones/MercadoSombrasZone.ts`, `src/entities/PlayerController.ts`,
`src/systems/PhysicsService.ts`.
