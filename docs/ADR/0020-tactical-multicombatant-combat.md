# ADR-0020 — Tactical combat: spatial movement + multi-combatant by relationship ledger

**Status:** Accepted (Fase 8, branch `feat/combat-tactical`)
**Supersedes parts of:** [ADR-0019](0019-turn-based-combat.md) (1v1 melee, scalar distance)

## Context

ADR-0019 delivered turn-based 1v1 melee combat with an abstract **scalar distance**
(no repositioning) and a hard "exactly two combatants" model. The owner wanted to
evolve it toward a Baldur's-Gate-style tactical fight: avatars at **real world
positions**, **movement that costs AP** with an on-ground preview, and
**multi-combatant** battles where each NPC chooses a side from its **own relationship
ledger** (no factions). Decided with the owner across two rounds (see the Fase 8
subplan): the work splits into **8A — spatial movement** (prerequisite, still 1v1)
and **8B — multi-combatant + autonomous/spectator combat**.

## Decision

### 8A — Spatial movement (pure core + browser)
- **Distance is real 2-D ground position** per combatant (`CombatantInit.pos {x,z}`),
  not a scalar. `MELEE_RANGE = 1 m`; `FLEE_MIN_DISTANCE = 10 m`.
- **Move action** (`{type:'move', to}`) costs **1 AP/m of the ROUTED path**. Movement
  is routed **around obstacles** by an injected `Pathfinder`; the default is a straight
  line and the scene injects a grid-A* router built from the world colliders
  (`CombatMovement.buildWalkGrid` over `COMBAT_OBSTACLES`/`COMBAT_BOUNDS` →
  `gridPath`, 8-connected, no diagonal corner-cutting).
- **Attack carries a `targetId`**; melee requires Euclidean distance ≤ `MELEE_RANGE`.
  **Flee** is allowed only when the nearest living foe is > `FLEE_MIN_DISTANCE`.
- The **NPC AI** decides abstractly ("move toward target" / "attack"); the controller
  resolves the concrete routed destination (reserving AP for a strike) and the target.
- **Browser:** clicking **Move** draws an on-ground vector **trail** (green if ≤ AP
  metres, red if over) and a click commits it; the avatar **walks the routed polyline**.
  Clicking **Attack** then clicking a combatant **avatar within 1 m** strikes it (a
  miss never splashes onto a bystander — friendly fire requires deliberately clicking
  an ally).

### 8B — Multi-combatant by relationship ledger (no factions)
- **Scale unchanged** (`NPCDisposition = hostile|wary|neutral|friendly`; no save
  migration). Reused as a structured **NPC→NPC ledger** on `NPCAgent`
  (`getRelationship/setRelationship/worsenRelationship`, seeded from
  `NPCDefinition.npcRelationships`; Zara↔Mback = `wary`). Persisted in `npcMemory`
  (`relationships`), with `SaveService.NPCMemory` widened (disposition + ledger;
  optional, so legacy saves load unchanged).
- **Sides, not factions.** Each combatant has an opaque `side`; a **foe is anyone on a
  different side**. The encounter is N-way: `advance()` skips dead/removed combatants,
  the fight ends when **≤1 side stands**, and the outcome is player-centric
  (`player_won`/`player_lost`/`fled`) plus **`resolved`** for a player-absent fight.
- **Recruitment** (`CombatRecruiter.recruitSides`, pure): the initiator and target seed
  the two sides; every present combatant (**whole scene**) joins the side its
  relationships pull hardest toward — **hostile/wary → oppose** a fighter,
  **friendly → defend** them — summed by magnitude; **ties / all-neutral stay out**.
- **Allies are AI-driven** (they fight for the player automatically). The controller
  drives any number of combatants: `stepNextAiTurn()` (one AI turn) and
  `runToCompletion()` (autopilot a player-absent fight).
- **Flee continues the fight:** fleeing **removes** that combatant; if a side still has
  fighters the battle goes on. The player fleeing closes their action bar but the
  remaining NPC↔NPC fight **continues live** (spectator).
- **Friendly fire** is only via intentionally targeting an ally: it worsens that ally's
  disposition one step and, **at wary, flips them to the opposing side**
  (`friendlyFireDefection` + `setSide`).
- **Triggers:** (a) player attacks / a hostile-to-player NPC → **interactive** combat;
  (b) a deliberated `attack` on a hated NPC → **autonomous** NPC↔NPC fight, run as a
  **live spectator** (camera + animations + portraits, **turns paced ~0.7 s**, no
  action bar). Browser turn pacing is scene-driven (`tickCombat`); the camera frames
  the **centroid** of the standing combatants (`centroidOf`).

### What stayed / deferred
- **Melee-only** loadout (no firearms/scenery cover) — `MELEE_ONLY_CAPS` unchanged.
- **like/love economy** (charisma discount, free items) — **deferred** (no
  inventory/negotiation yet; `friendly` only means "defends" in combat).
- Building footprints in the move grid (today: perimeter + exit wall), per-NPC stat
  blocks, block/crouch poses (rig retarget), weapons/ammo — future.

## Consequences
- Pure core (`CombatMath`/`CombatEncounter`/`CombatAI`/`CombatController`/
  `CombatMovement`/`CombatRecruiter`) stays ~100% lines / >90% branch tested; all
  Babylon/DOM (trail, picking, walk tween, timed driver, centroid camera, spectator
  overlay) is `typeof document`-guarded + `istanbul ignore`d and validated in Electron.
- The 1v1 path is a special case of the N-way model (player-side vs enemy-side), so
  ADR-0019's behaviour is preserved.
- Token cost: the only Claude call in combat remains the rare critical-hit narration,
  gated by `ClaudeCallQueue`; autonomous fights reuse that path.
