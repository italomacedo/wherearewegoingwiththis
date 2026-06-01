# ADR-0018 — Living NPCs: intent deliberation + A* nav + throttled call queue

**Status:** Accepted (Fase 5 of the living-world track). Combat that consumes the
`attack` intent stub lands later (turn-based).

## Context

NPCs were purely reactive to the player. The owner wants them to act on their
own — reflect, walk over to each other, gossip on-screen, and shift how they feel
about the player — without letting autonomous Claude calls blow up token cost. An
economic analysis (measured prompt sizes via `TokenMeter` + `PromptBuilder`)
produced the approved throttle: proactive reflection **every 8 min/NPC** (jitter
±25%), a global **6 s** min-gap, a **per-minute cap** (default 8), one gossip at a
time, and **player turns bypass the queue** (human-paced). All of it is
**configurable in Options**.

## Decision

**Two-layer brain.** (1) *Deliberation* — a throttled Claude call picks ONE item
from a tiny constrained menu; (2) *Navigation/gossip* — deterministic A* + a
browser mesh-mover carries it out.

- **A\* (`src/systems/Pathfinding.ts`, pure):** `computePath`/`computeRoute`/
  `nearestWaypoint` over an authored `WAYPOINT_GRAPH` (27 nodes, 3 lanes along the
  downtown street, in `WorldAssetCatalog`). No navmesh, no new deps.
- **Throttle (`src/systems/ClaudeCallQueue.ts`, pure, injected clock):** every
  *autonomous* call is enqueued; `tryDispatch` gates on min-gap + rolling
  per-minute cap + per-key cooldown (dedupes pending by key → no pile-up).
  `queueConfigFromSettings` maps Options → config; `nextReflectionDelay` jitters.
- **Intent (`src/systems/npc/Intent.ts` + `PromptBuilder.buildIntentPrompt`):**
  menu = `stay | approach <npc> | attack <npc> | react_to_player`; `parseIntent`
  validates the target and degrades safely (`approach`/`attack` without a real
  target → `stay`). `attack` is a **reserved stub** (flag/log) for future combat.
- **Dispositions (`NPCAgent`):** `disposition` is dynamic + **persisted in
  `npcMemory`** (`NPCMemoryEntry`, `restoreDisposition`). `worsenDisposition`,
  `onHostilePlayerAction` (worsen + ultimatum-on-first-offence), `shouldInitiateCombat`
  (hostile + player present → `attack` stub), and `onThreat` reacts by disposition.
- **Orchestration (`NPCManager.tickAutonomy`, async, unit-tested):** flag hostile
  attackers, enqueue eligible deliberations, dispatch one, run it; `runDeliberation`
  + `runGossip` (two lines, both sides' memory updated).
- **Wiring (`GameWorldScene`, browser-only/`istanbul ignore`):** ~1 Hz driver
  gated on the `npcAutonomy` setting → `tickAutonomy`; an `approach` intent plans
  an A* route and a mesh-mover walks it; on arrival a one-shot gossip exchange is
  surfaced as dialog narration lines.

## Consequences

- Decision logic, A*, throttle, intent parsing and disposition transitions are all
  pure and unit-tested; only the Claude/mesh loop is `istanbul ignore`d behind a
  `typeof document` guard. 817 tests, coverage ≥95/90.
- **Gossip needs ≥2 co-located NPCs** to be *visible*; the mechanism is live with
  one NPC (deliberation/react). Spawning a second street NPC is a content follow-up.
- Real token usage (vs the `~4 chars/token` estimate) is still optional via
  `--output-format json`; the queue makes worst-case cost bounded regardless.
