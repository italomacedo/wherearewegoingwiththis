# World Design — NeoBeiraRio

## City Overview

NeoBeiraRio, 2087. A megacity built over what was once Porto Alegre, Brazil. Three decades of unchecked corporate expansion turned it into a vertical sprawl of towers, elevated highways, and underground markets. The sky is always overcast. Rain is constant. Neon is everywhere.

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
