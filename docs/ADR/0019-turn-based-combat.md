# ADR-0019 — Turn-based combat (AP economy, power-ratio hit, scalar distance)

**Status:** Accepted (Fase 7). Consumes the `attack` intent stub reserved in
[ADR-0018](0018-living-npcs-autonomy-astar-throttle.md).

## Context

The RPG foundation ([ADR-0016](0016-rpg-stats-power-ratio-checks.md)) and living
NPCs ([ADR-0018](0018-living-npcs-autonomy-astar-throttle.md)) left an `attack`
intent that only logged. The owner wants a real **turn-based** duel that consumes
the RPG stats. The model was decided with the owner, lever by lever:

- **A turn represents ~1 second.** Action points come from **Destreza**:
  `AP = round(Destreza / 10)`. The minimum Destreza (20) yields **2 AP = exactly
  one primary action and nothing else**; Destreza 60 = 6 AP; 100 = 10 AP. Destreza
  is the single combat-tempo lever (no double-dipping into move speed).
- **Costs:** primary action (ranged shot / melee strike) = **2 AP**; secondary
  (take cover / hunker / reload / item) = **1 AP**; movement = **1 AP per metre**.
  No cap on primary actions per turn (owner's call) — AP is the only limit.
- **Spatial model:** a single **scalar distance in metres** between the two
  fighters (not a grid). Moving closes/opens it; melee needs distance ≤ 1.5 m.
- **Hit:** the power-ratio `SkillCheck` (k=2) — melee uses Combate Corpo-a-Corpo
  (Força), ranged uses Armas de Fogo (Destreza), versus the defender's dodge
  (Percepção/Destreza) plus cover (**+20** partial / **+40** full on the defender).
- **Damage on a hit:** attribute-scaled + small variance (melee `8 + Força/10`,
  ranged `10 + Destreza/20`, each `+ d(0..4)`).
- **Initiative:** ordered by Destreza (deterministic id tie-break).
- **Scope:** **1v1** — only an NPC that is **hostile to the player** enters combat
  (the `attack` intent). Multi-combatant is deferred.
- **Everything tunable in Options** (owner requirement): the AP divisor and the
  three action costs (`combatApPerDexterity` / `combatPrimaryCost` /
  `combatSecondaryCost` / `combatMoveApPerMeter`).

## Decision

Pure, fully-tested core under `src/systems/combat/`; the only browser code is the
overlay GUI and the scene wiring (`istanbul ignore`d, like PauseMenu/Dialog).

- **`CombatMath.ts` (pure):** `actionPointsFor`, `moveApCost`/`maxMoveMeters`,
  `resolveAttack` (→ SkillCheck), `rollDamage`, `initiativeOrder`,
  `combatTuningFromSettings`, cover/melee-range constants.
- **`CombatEncounter.ts` (pure state machine):** a 1v1 — Destreza initiative,
  per-turn AP refill, scalar distance, `apply(action)` for attack/move/cover/
  hunker/reload/flee/end_turn with AP + range gates, cover that resets each turn
  and breaks on movement, win/lose on death and fled on flee. Injected RNG.
- **`CombatAI.ts` (pure policy):** `chooseCombatAction` — take cover when hurt and
  exposed, brawlers close (reserving AP for the strike) then strike, gunners shoot
  then cover; `prefersMelee` derived from stats.
- **`CombatNarration.ts` (pure):** `combatBeat` turns an event into one factual
  sentence — the Claude seed AND the offline fallback.
- **`CombatController.ts` (pure):** orchestrates player→enemy turns, exposes the
  affordable `playerActionOptions`, runs the enemy turn, emits log entries.
- **`PromptBuilder.buildCombatNarrationPrompt` + `NPCManager.narrateCombat`:**
  Claude dramatizes a beat in one cinematic sentence (no numbers/mechanics);
  fails open to the factual beat. Only **salient** beats (hit/miss/death) are sent
  → bounded cost.
- **`CombatOverlay.ts` (browser) + `GameWorldScene` wiring:** a hostile NPC's
  `attack` intent calls `startCombat`; the overlay freezes the world (pause
  pattern), renders AP/distance/HP + a beat log + action buttons; on resolution it
  syncs the player's HP into the session, relaxes a **defeated** NPC's disposition
  (defeated, not killed), and a loss drops the player to 0 HP → existing game-over.

## Consequences

- The duel consumes the RPG sheet end-to-end (Destreza→AP, skills→hit,
  attributes→damage), so character building now matters mechanically.
- Combat is deterministic given RNG → unit-tested without a GPU/DOM; combat
  modules sit at ~100% coverage.
- **Deferred:** multi-combatant fights, weapons/ammo (reload is flavour for now),
  per-NPC stat blocks (a street-tough block is used), persisting an in-progress
  fight across save/load, and AP/turn feedback animations on the avatars.
