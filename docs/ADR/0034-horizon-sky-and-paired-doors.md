# ADR-0034 — Horizon camera + dynamic sky + F-activated paired doors

**Status:** Accepted (owner-decided)
**Date:** 2026-06-13

## Context

Two limitations surfaced once the procedural mosaic (ADR-0029) and authored
interiors (Fase 24) were in place:

1. The default camera framed the hero too tightly (a hold-over from the closed
   downtown street), so the streamed city never read "to the horizon", and there
   was no sky — `scene.clearColor` was a flat fill, so day/night (the `GameClock`
   already drove fog/ambient) had no celestial cue.
2. Scene-to-scene travel (downtown ↔ interiors, future street ↔ street) relied on
   an **invisible walk-in Door Trigger** authored in the Scene Editor, plus a
   hand-placed spawn pad in the target scene. Walking into an invisible volume is
   non-diegetic, and keeping the two ends' spawn pads in sync by hand was fragile
   (and Fase 18/Lesson 62 showed how easily a bad saved/spawn position black-
   screens a load).

## Decision

### 1. Horizon camera

`src/systems/CameraSystem.ts`: the default `zoomDefault` opens to **22** (near-
horizon framing) at a lower angle, and **mouse-wheel zoom is unlocked on foot**
(`setWheelZoomEnabled` / `wheelZoomOverride`; previously wheel-zoom was combat-
only to block on-foot metagaming — that restriction is dropped for the open
world; conversation mode still suppresses it unless overridden).

### 2. Dynamic sky — pure state + browser renderer

`src/systems/SkySystem.ts`, split the project's usual way (pure core 100%-
testable with NullEngine; renderer browser-only / `istanbul ignore`d):

- **Pure** `computeSkyState(hour)` → `SkyState`: a keyframed zenith/horizon
  gradient (`SKY_KEYFRAMES`, linearly interpolated), sun/moon world directions
  via `sunElevationRad` + `celestialDirection` (Y-up, +Z north, +X east; sun
  rises east/sets west, moon roughly opposite), per-elevation `sunColor`
  (yellow→orange→deep-red near the horizon), sun/moon visibility smoothstepped
  across the 5° horizon crossing, `starOpacityForHour` (full at night, ramped at
  dawn/dusk), and the smooth `DayPalette` from `GameClock`.
- **Browser** `SkyRenderer`: a gradient **dome** (`ShaderMaterial`, BACKSIDE),
  emissive sun/moon spheres, a 150-star `SolidParticleSystem` placed on a
  Fibonacci sphere with a fixed brighter/bluer **North Star** at index 0, and a
  `DirectionalLight` that tracks the sun (intensity ∝ elevation) for soft daytime
  shadows. `update(state, scene)` also drives `scene.clearColor` from the zenith.
  `setEnabled(false)` hides the whole sky **inside interiors**.
- Wired in `GameWorldScene` from the `GameClock` hour each frame.

See **Lesson 64** for the non-obvious dome wiring (camera-parented +
`infiniteDistance` + depth/rendering-group + the 5th-light dependency on the
Lesson-30 `maxSimultaneousLights` bump).

### 3. F-activated paired doors

Doors become **authored prop MODELS that carry a `targetSceneId`** (and optional
`spawnPoint`), replacing the editor's invisible Door Trigger (removed from the
gallery). `src/systems/world/SceneDocToTile.ts`:

- `propDoorTriggersForTile(doc, tx, tz)` lifts every prop with a non-empty
  `targetSceneId` to a world-space `WorldDoorTrigger` (a default
  `PROP_DOOR_SIZE` AABB centred on the prop, keyed `qp-` to stay unique vs the
  legacy `q-` invisible triggers). The legacy `doorTriggersForTile` still maps
  authored `DoorTriggerDoc`s for back-compat.
- Activation is by **F** when the hero stands in a door's AABB (not automatic
  walk-in) — diegetic, and it can't trigger by accident.
- **Arrival is automatic**: the player lands **in front of the target scene's
  reciprocal door** (the door whose `targetSceneId` points back), so no
  hand-placed spawn pad is needed and the two ends can't drift out of sync.
- **Interiors require an explicit exit door** (the old auto-return volume is
  gone); interior restore on load respawns the player in front of a door, which
  also self-heals a bad saved interior position.

### 4. Save migration

`WorldState.interior` (in `GameSession` / `SaveService`) gains
`originTile?: [tx, tz]` — the mosaic tile the player entered an interior from, so
a reload rebuilds the room and the exit lands them on the right tile. The legacy
`entry?: WorldDoorTrigger` field is kept **only** for restore-time migration of
older saves.

## Consequences

- The open world reads to the horizon with a believable day/night sky; the
  `GameClock` now has a visible celestial anchor, not just fog/ambient tint.
- Scene travel is diegetic (walk to a door, press F) and self-consistent — there
  is one source of truth (the reciprocal door), eliminating a class of
  spawn-pad-desync and black-screen-on-load bugs.
- The sky is one more pure-core/browser-renderer pair, fully tested where it can
  be; the renderer is `istanbul ignore`d like every other Babylon glue.
- No new top-level save field — only `world.interior.originTile`; old saves load
  unchanged (legacy `entry` migrated).

## Source

`src/systems/SkySystem.ts`, `src/systems/CameraSystem.ts`,
`src/systems/world/SceneDocToTile.ts` (`propDoorTriggersForTile`,
`WorldDoorTrigger`), `src/systems/sceneeditor/{SceneDoc,EditorState,EditorPanels}.ts`,
`src/scenes/{GameWorldScene,SceneEditorScene}.ts`, `src/core/GameSession.ts`,
`src/systems/{SaveService,GameClock,I18n}.ts`, `public/scenes/{downtown,myhouse,index}.json`.
