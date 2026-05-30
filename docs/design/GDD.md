# Game Design Document — Where Are We Going With This

**BeiraRio Games | Version 0.1 | 2026-05-30**

---

## Concept

A single-player cyberpunk isometric open-world RPG set in **NeoBeiraRio** — a rain-soaked megacity of neon signs, corporate towers, and underground markets. The player navigates this world as a customizable operative, interacting with citizens powered by live Claude AI. Every conversation is unique, every NPC remembers context.

**Core Fantasy:** "I am a ghost in a living cyberpunk city where everyone has something to say."

---

## Pillars

1. **Living NPCs** — Characters react to who you are, what you've done, how you look. Powered by Claude CLI.
2. **Deep Customization** — Your body is your identity. Build from skin to chrome augmentations.
3. **Open World** — Explore NeoBeiraRio at your own pace. Flying vehicles, street level, and rooftops.
4. **Tactical Freedom** — Combat is optional. Firearms, katanas, implants, or pure conversation.

---

## Setting: NeoBeiraRio

A megacity in 2087 Brazil. Three districts planned for Phase 1:

| District | Vibe | Phase |
|---|---|---|
| **Mercado das Sombras** | Street market, beggars, info brokers, first NPC | Phase 6–8 |
| **Distrito Neon** | Nightclub strip, corpo agents, high-fashion crime | Phase 10+ |
| **Alto Cromo** | Corporate towers, drones, clean streets, cold NPCs | Phase 10+ |

---

## Core Systems

| System | Description | Phase |
|---|---|---|
| Character Creator | Modular GLTF: body, hair, clothes, implants | Phase 4 |
| Save/Load | JSON files + screenshot thumbnails | Phase 5 |
| Isometric Camera | ArcRotateCamera, follow player, Q/E rotation | Phase 6 |
| Player Controller | WASD movement, animations, collision | Phase 7 |
| Claude NPC | subprocess per NPC, streaming dialog | Phase 8 |
| Vehicles | Flying car + flying Harley | Phase 9 |
| Combat | Firearms (raycasting) + Katana (hitbox) | Phase 10 |
| Implants | Slot system: passive/active augmentations | Phase 10+ |

---

## UI Flow

```
Launch → Splash (BeiraRio Games logo)
       → Studio ("A BeiraRio Games game")
       → Publisher ("Published by BeiraRio Games")
       → Main Menu
           ├── New Game → Character Creator → Game World
           ├── Load Game → Save List → Game World
           ├── Options → [Game / Display / Video / Audio]
           └── Quit
```

---

## Combat Design (Phase 10+, high-level)

- Real-time with manual aiming
- Firearms: point-and-click aiming, ragdoll physics on death
- Katana: melee hitbox, combo system, parry window
- Implants: augment player abilities (optical zoom, sub-dermal armor, reflex boost)
- NPCs react to violence even if not targeted

---

## NPC Design Philosophy

- Each NPC has a **persona prompt**: name, role, mood disposition, knowledge of player
- Conversation history is trimmed to last 5 exchanges to keep context tight
- NPCs **notice actions**: approaching fast → nervous, weapon drawn → hostile/scared
- NPCs do NOT have infinite memory across save sessions (memory = session only for MVP)
- City-wide reputation system planned for Phase 10+

---

## Player Character

- No fixed class — build through implants and equipment
- Name and appearance fully customizable
- Starting zone: Mercado das Sombras, a public market
- First encounter: a street vendor NPC (first Claude CLI test)

---

## References

- Satellite Reign — real-time tactical, isometric, cyberpunk city
- Space Haven — colony sim feel, crew with AI personalities
- Cyberpunk 2077 — aesthetic, implants, open world tone
