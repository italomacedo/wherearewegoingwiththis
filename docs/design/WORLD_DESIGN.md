# World Design — NeoBeiraRio

## City Overview

NeoBeiraRio, 2087. A megacity built over what was once Porto Alegre, Brazil. Three decades of unchecked corporate expansion turned it into a vertical sprawl of towers, elevated highways, and underground markets. The sky is always overcast. Rain is constant. Neon is everywhere.

> **Implementation status (this cycle) — gap #4 is the next target.** The starting
> district (Mercado das Sombras) is **fully procedural** (primitives + emissive neon +
> rain). `MercadoSombrasZone.loadRealAssets` is a no-op and `AssetManifest` lists intended
> paths under `public/assets/` with **no files present**.
> **Key constraint discovered:** the coding agent **cannot download/commit binary assets**
> in this environment (no Sketchfab/Poly Haven MCP wired; `WebFetch` returns text, not
> binaries). So real assets need either **(a)** the owner dropping files into
> `public/assets/`, or **(b)** runtime-loading CC0 assets from a CDN URL (Poly Haven) —
> an architectural choice (offline/latency/external dependency) to confirm first.
> Recommended next step: build+test the loading pipeline (flip `CharacterAssembler.useGltf`,
> implement `loadRealAssets`, populate `AssetManifest`) with procedural fallback, then
> source assets via (a)/(b). The curated CC0/CC-BY catalog below stands for manual download.

---

## World Structure

The world is divided into **zones** — self-contained districts that stream in as the player approaches. Each zone is a Babylon.js `Scene` chunk loaded asynchronously.

### Phase 6–8 (MVP): Mercado das Sombras

The starting district. A sprawling underground market carved from the basement levels of three collapsed towers. Street food, data brokers, stolen chrome, and people who ask no questions.

| Element | Description |
|---|---|
| Size | ~400m × 400m walkable area |
| Layout | Market stalls, narrow alleys, two open plazas |
| Ambient | Rain SFX, distant music, crowd murmur |
| NPCs | Zara (Phase 8 test), 2-3 ambient NPCs (scripted) |
| Lighting | Point lights per stall, blue-green neon, puddle reflections |
| Vehicles | None in market (foot traffic only), flyby vehicles overhead |

---

## Isometric Camera Setup

- Camera angle: **45° elevation, configurable between 30°–60° in Options**
- Camera rotation: player presses Q/E to rotate world 45° increments
- Camera zoom: mouse scroll, range 10–50 units
- Camera follows player with smooth damping (lerp factor 0.1 per frame)
- No camera clip through buildings — use transparency on occluding meshes

---

## World Population

**Phase 8 MVP:**
- 1 interactive NPC (Zara — Claude CLI)
- 3-5 ambient NPCs (procedural patrol paths, no dialogue)

**Phase 10+:**
- Dynamic NPC spawner per zone
- Street activity system (vendors, fights, corpo raids)
- City-wide events

---

## Environment Layers

```
Sky         → HDRI from Poly Haven (overcast night)
Skyline     → Distant building billboards (static meshes)
Elevated    → Flyover vehicles (Phase 9), bridges, upper walkways
Street      → Main play area: terrain, NPCs, player
Underground → Phase 10+: sewers, corporate basements
```

---

## Asset Sourcing Plan

| Element | Source | Priority |
|---|---|---|
| Street terrain | Poly Haven textures (asphalt, concrete) | Phase 6 |
| Building facades | Sketchfab MCP: "cyberpunk building modular" | Phase 6 |
| Market stalls | Sketchfab MCP: "market stall lowpoly" | Phase 8 |
| Neon signs | Procedural (Babylon.js emissive materials) | Phase 6 |
| HDRI sky | Poly Haven: night/overcast | Phase 6 |
| Rain particles | Babylon.js ParticleSystem (procedural) | Phase 6 |
| Vehicles | Sketchfab MCP: "flying car cyberpunk" | Phase 9 |

## Curated Free Assets for Mercado das Sombras (researched 2026-05-30)

All free for commercial use. **Download manually** and place under `public/assets/`;
the zone falls back to procedural geometry until they exist (`loadRealAssets`).

### PBR Textures — Poly Haven (CC0, API: `api.polyhaven.com`)
| Asset | Slug | Use |
|---|---|---|
| Asphalt 02 | `asphalt_02` | Wet street ground |
| Rusty Metal Grid | `rusty_metal_grid` | Industrial flooring (turquoise/rust patina) |
| Concrete Floor Damaged 01 | `concrete_floor_damaged_01` | Weathered walkways |

### HDRI Sky — Poly Haven (CC0)
| Asset | Slug | Use |
|---|---|---|
| Cobblestone Street Night | `cobblestone_street_night` | Primary night ambiance (warm lamps, wet reflections) |
| Urban Street 01 | `urban_street_01` | Soft overcast fill |

### 3D Props — Sketchfab
| Asset | Creator | License | Notes |
|---|---|---|---|
| [Building + Modular Facades CC0](https://sketchfab.com/3d-models/building-modular-facades-cc0-03d8c98bd382419ca364c68d6a004d3a) | Lit For 20 | **CC0** | glTF/Blend, low-poly, no attribution needed |
| [PSX Industrial Pack](https://sketchfab.com/3d-models/psx-industrial-pack-12cb749961974f94a4063e67dafb2d76) | Tomitos | CC-BY | 20 props, great value |
| [Crates And Barrels](https://sketchfab.com/3d-models/crates-and-barrels-5ae3c72285474862a89d69c2f2ad2246) | Mateusz Woliński | CC-BY | game-ready clutter |
| [Market Stall (Dirty)](https://sketchfab.com/3d-models/market-stall-ff6c0680a17e40989043a503c86e3f33) | Kairomitsu | CC-BY | vendor stall, retexturable |

**Recommended starting set (all CC0, zero attribution):** Asphalt 02 + Cobblestone Street
Night HDRI + Building Modular Facades CC0.
