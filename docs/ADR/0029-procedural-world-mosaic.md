# ADR-0029 — Procedural World Mosaic (24×24 seamless streaming)

**Status:** Accepted (Fase 17 A–G code-complete on `feat/procedural-world`; awaiting Electron playtest).
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

## Consequences
- Dealers (`arm_dealer`/`armor_dealer`) carry sellable loadouts → the existing `Economy`/`Commerce`/
  `Missions` chat flow works on procedural NPCs with no change.
- NPC autonomy auto-scopes to loaded-tile agents (the agents map only holds them); `ClaudeCallQueue`
  still bounds total Claude cost.

## Deferred / known follow-ups
- **Nave confinement** stays ±30 around origin (atmospheric, near downtown) — world-wide flight (clamp
  around a moving centre) is future.
- **Per-tile waypoint graphs** for autonomous NPC A* approach (gossip) — procedural tiles reuse the
  downtown graph; off-(0,0) gossip pathing is simplistic. Future.
- **Seam fog/lighting blend** — scene-global fog isn't yet eased per current theme (the themed ground
  already differentiates tiles). Future.
- **Defeated/dropped-item persistence** keeps parity with pre-17 behavior (no per-tile delta store).
- Visual **scale/density tuning** of nature props pending the Electron playtest.
