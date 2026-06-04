# ADR-0029 — Procedural World Mosaic (24×24 seamless streaming)

**Status:** Accepted (Fase 17 A–G + 17H **merged to `main`**, owner-validated in Electron; crash fixed).
**Date:** 2026-06
**Supersedes:** the single static `MercadoSombrasZone` as the whole world (it becomes tile (0,0)).

## Fase 17G — city-grid layout (the roads ARE the grid)
The road model was inverted: instead of a street through the middle of each tile, the **mosaic grid
(tile edges/seams) is the asphalt road**. Only **urban** themes (downtown/market) get the frame — pure
`src/assets/world/CityFrame.ts` (100% tested): `framePlanes` (asphalt 60 ▸ sidewalk 52 ▸ themed interior
44, stacked), `crosswalkStripes` (emissive zebra across the road at each edge), `manholeSpots` (covers on
the road ring), `interiorBuildingSlots` (2 rows × 3, central plaza, non-overlapping). `TileScenery` draws
the frame for urban tiles (buildings placed in the slots, **scaled-to-fit** so they never overlap) and a
full themed ground for nature tiles (off the grid). `MercadoSombrasZone` (0,0) adopts the same frame:
removed the central asphalt/markings + the central catalog sidewalks + doors; buildings repositioned into
the interior slots (fixes the overlap); world-border walls only (gap-filler brick walls dropped). Nave
confined to the whole world (`worldBounds`). Themes other than urban blend edge-to-edge.

## Context
The game had one static closed street. The owner wants an open world: a **24×24 mosaic of 60×60
scene tiles** (1440×1440 u). Only the **outer edges of border tiles** have invisible walls; interior
edges are open. Tile **(0,0) stays the existing static downtown** (reserved for story); every other
tile is **procedural, deterministic from a world seed**. Each tile has a **theme** (downtown / park /
forest / desert / market) → an **archetype** (buildings/foliage/props + NPC count/backstories).

## Decisions (owner-locked)
- **Seamless 3×3 streaming**, one continuous Babylon scene/coordinate space. Tile (tx,tz) centre =
  world `(tx*60, 0, tz*60)`, so (0,0) is the origin = where downtown is already authored (zero offset).
  Current tile + 8 neighbours load; crossing an edge diff-streams the ring with **no fade/teleport**.
- **Theme random per tile** (seeded weighted roll); (0,0) forced downtown.
- **Persist the whole world** = the **layout regenerates from the seed** (never stored) + the **mutable
  NPC state persists** in the flat `npcMemory` keyed by **globally-unique per-tile NPC ids**
  (`${role}_t${tx}_${tz}_${i}`) — no separate per-tile delta store needed.
- **Authored archetype pools** for NPC names/personas/outfits/loadouts (seed picks); NPCs still talk
  live via Claude.
- **(0,0) opens east**: the +X exit wall + east collider are dropped so the street flows into tile
  (1,0); west/north/south stay capped (world border + building rows).

## Architecture
Pure cores (100% unit-tested, no Babylon/DOM):
- `src/systems/world/WorldGrid.ts` — tile↔world math, `neighbors3x3`, `ringDiff`, `isBorderEdge`,
  `borderWallColliders`, `worldFloorBox`, `WORLD_HALF_EXTENT`.
- `src/systems/world/SeededRng.ts` — `mulberry32`/`hash32`/`tileSeed` + `pick/range/intRange/shuffle/
  weightedPick`, mirroring the injected-`RollFn` pattern. **Fixed draw order in `generateTile`** = a
  tile is identical forever for the same seed.
- `src/systems/world/WorldStreamer.ts` — injected `onLoad`/`onUnload`, hysteresis tile-switch, ring
  diff/bookkeeping. The Babylon work is the injected callback, so this stays pure.
- `src/assets/world/ThemeRegistry.ts` — 5 archetypes + authored NPC pools + `generateTile(tx,tz,seed)`
  → `{theme, ground, props (world-positioned, solid flag), npcDefs (unique ids)}`. Theme-aware layout:
  **urban** (downtown/market) lines buildings on edges; **scatter** (park/forest/desert) scatters
  trees/rocks/foliage with a themed ground tint.

Browser glue (`typeof document` guard + `istanbul ignore`):
- `src/systems/world/TileScenery.ts` — loads a tile's generated prop GLBs (`LoadAssetContainerAsync` +
  holder, like `loadRealAssets`), themed ground plane, border-wall + solid-prop colliders; disposes all together.
- `GameWorldScene` — builds the `WorldStreamer` at spawn (`tileOf(spawn)`), drives it each frame from the
  player position, builds **one big world floor box** (no per-tile seam), and per tile spawns/despawns
  procedural NPC avatars+capsules. `NPCManager.spawnTile/despawnTile/spawnWithMemory` track NPC ids per
  tile and flush their memory back on unload (unit-tested).

Persistence: `SaveGame.world` gains `worldSeed` (derived stably from the saveId; `migrate` backfills
legacy saves) + `currentTile`; `GameSession` carries them; the seed makes the world regenerate identically.

Assets: Quaternius **Ultimate Nature Pack** (CC0) — curated 37-model subset (`world/nature/`, ~2.1 MB)
via `scripts/convert_assets.py`. market reuses downtown + vendor props.

## Fase 17H — streaming without stutter (perf)
Flying the nave hitched constantly: every tile re-parsed the same GLBs (no cache), every procedural NPC
built a full modular avatar, and crossing an edge burst 3 tiles (fire-and-forget) of GLB + collider +
avatar work on the main thread. (A WebWorker can't help — Babylon mesh/collider creation is main-thread.)
Fix:
- **`AssetCache`** (`src/systems/world/AssetCache.ts`, pure dedup + browser instancing): each GLB parsed
  **once** (in-flight + cached), then **cloned** via `instantiateModelsToScene` (GPU-instanced static
  props share geometry/material — they aren't per-instance tinted).
- **Time-sliced loading**: `TileScenery.build()` does only the cheap synchronous frame and queues props;
  `step(cache)` instantiates ONE prop; `GameWorldScene.pumpTileLoads` runs ≤`TILE_LOAD_BUDGET` (2) prop
  instantiations/frame behind a single-flight guard → no burst.
- **Bigger preload ring, NPCs nearer**: scenery streams a **5×5** ring (`WorldStreamer` radius 2 +
  `WorldGrid.neighbors(radius)`) so tiles load ahead of the fast nave; **NPCs only in the inner 3×3**
  (`updateNpcRing`/`enqueueTileNpcs`/`despawnTileNpcs`), with avatar builds queued ≤1/frame
  (`pumpNpcSpawns`). The heaviest work never runs for far tiles.
Deferred: routing NPC outfit GLBs through `AssetCache` + instancing skinned avatars (skeleton-rebind on a
clone — Lesson 33 territory); downtown `loadRealAssets` via the cache (loads once, not a streaming cost).

### Crash fix — autonomy scoped to the player's current quadrant (owner-validated)
Flying/exploring the streamed world **crashed the Electron MAIN process** (PID gone, no JS stack) after
~10 `claude.exe` deliberations. Not Havok and not Lesson 34's unhandled stream error (that net was
already in place) — the root cause was the **VOLUME** of autonomous LLM subprocesses: the 5×5/3×3 world
keeps ~20 procedural NPCs loaded and autonomy deliberated **all** of them (each its own
`ClaudeCallQueue` cooldown key → rapid rotation). Serializing to 1 concurrent call did NOT fix it — it's
cumulative process pressure on `main`, not concurrency. Owner-rejected: "only authored NPCs autonomous."
**Owner-mandated fix:** autonomy follows the player's quadrant.
- `NPCAgent.setAwake(b)/isAwake()` — default `true` (headless/tests stay autonomous); `NPCManager.tickAutonomy`
  early-returns on `!isAwake()` (no deliberation enqueued, no `claude.exe` spawned).
- `GameWorldScene.updateAwakeNpcs()` — called from `updateNpcRing()`, which `streamWorld()` runs **only on
  tile change** — wakes exactly the current tile's NPC set (`tileNpcIds.get(curKey)`, or the authored
  `zoneNpcIds` at (0,0)) and hibernates everyone else.
- `driveAutonomy` also early-returns while `vehicle.isOccupied()` — flight crosses a quadrant every few
  seconds (a wake burst) and NPCs can't be engaged from the air.
Hibernating NPCs stay 100% interactive on contact (E / proximity / combat). See Lesson 42. (`feat/streaming-perf`.)

## Save deltas (Fase 18) — what the streamed world persists
The layout regenerates from `worldSeed`, so the save stores only **player-caused
mutable deltas**, keyed so they survive a tile streaming out and back in:
- **NPC state** lives in the flat `npcMemory` keyed by the globally-unique per-tile
  id (`${role}_t${tx}_${tz}_${i}`) — the id already scopes by tile, so no separate
  per-tile store is needed. `persistSession` now **merges** the memory flushed from
  already-despawned tiles (`this.npcMemory`) with the loaded agents' live memory
  (loaded wins); previously only loaded agents were saved, dropping off-ring NPCs.
- A **defeated NPC** persists as `{ defeated:true, inventory }` only — its
  conversation/disposition/ledger/events are dropped (it never converses again),
  the corpse inventory is kept so loot state survives. This keeps the save lean as
  the world is explored (owner-decided: keep living-NPC memory, dead = status only).
  `spawnWithMemory` re-marks `defeated`, so a killed NPC reloads dead, not alive.
- **Dropped items** persist in `SaveGame.groundItems` (`{tile,pos,id,qty}`), a flat
  list filtered per tile on render — pure `src/systems/world/GroundItems.ts`. The
  pile renders a pickup marker; `[E]` with no NPC in reach picks up the nearest one.

(This closes the Fase-17 "defeated/dropped-item persistence" deferral below.)

## Consequences
- Dealers (`arm_dealer`/`armor_dealer`) carry sellable loadouts → the existing `Economy`/`Commerce`/
  `Missions` chat flow works on procedural NPCs with no change.
- NPC autonomy is scoped to the player's **CURRENT quadrant** (wake/hibernate), NOT all loaded-tile
  agents — see "Crash fix" under Fase 17H above; `ClaudeCallQueue` still bounds total Claude cost on top.

## Deferred / known follow-ups
- **Nave confinement** stays ±30 around origin (atmospheric, near downtown) — world-wide flight (clamp
  around a moving centre) is future.
- **Per-tile waypoint graphs** for autonomous NPC A* approach (gossip) — procedural tiles reuse the
  downtown graph; off-(0,0) gossip pathing is simplistic. Future.
- **Seam fog/lighting blend** — scene-global fog isn't yet eased per current theme (the themed ground
  already differentiates tiles). Future.
- ~~**Defeated/dropped-item persistence**~~ — DONE in Fase 18 (see "Save deltas" above).
- Visual **scale/density tuning** of nature props pending the Electron playtest.
