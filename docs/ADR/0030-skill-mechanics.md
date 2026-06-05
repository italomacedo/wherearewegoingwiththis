# ADR-0030 — Skill Mechanics via Deterministic Chat Actions (all 13 skills)

**Status:** Accepted (Fase 20 A–J, branch `feat/skill-mechanics`; awaiting Electron playtest).
**Date:** 2026-06
**Builds on:** ADR-0016 (stats/power-ratio checks), ADR-0018 (autonomy/deliberation), the emote→check pipeline.

## Context
Every RPG skill existed as a number, but only combat (melee/ranged/AP), Pilotagem (nave speed) and
Atletismo (run speed) had a real in-game effect; the rest only flavored narrated checks. The chat
pipeline already classified an *emote* as DETERMINISTIC and ran a skill check, but the only mechanical
outcome was combat or a self-exam. Goal: give **every skill** a concrete mechanic through the same
flow — *emote (T/E) → classify → resisted vs surprise → skill check → narrative (TTS) + mechanical
result → (if surprise) the NPC may notice later and react.*

## Decisions (owner-locked)
- **Scope:** all 13 skills this phase. **Reach:** non-combat skill actions hit NPCs within
  `SKILL_ACTION_RADIUS = 30 m`. **Capability gate** at resolution (inventory + tool), classifier stays
  inventory-blind. **Resisted vs surprise** by a deterministic awareness rule (covert + unaware target =
  surprise; open confrontation / aware target = resisted).
- **Pervasive HP** for player AND NPC: combat reads/writes the same persistent HP (no more
  combat-only HP); a damaging action initiates combat (ambush). Max HP scales with Resistência
  (`maxHpFor`). NPC HP persists in `npcMemory.health`.
- **Cyberdeck rule:** IT ≥ 20% ⇒ amateur hacker ⇒ born with a `cyberdeck` (PC creation + procedural
  NPCs). IT actions are gated on holding a deck.
- **Surprise detection:** a successful covert action seeds a `TamperTrace`; on the NPC's next
  deliberation it rolls Perception (theft) or IT (hack — undetectable without a deck) vs the player's
  skill; a notice records an event, worsens disposition (can escalate to combat), clears the trace.
- **Info → PDA:** the `info` effect cracks identity + writes a persisted dossier to the player's **PDA**
  (new ribbon/`P` overlay, Character-Sheet pattern).
- **Magnitude:** disposition/relationship change one step per success, two on a critical (roll < 5).
- **Engineering:** repair (placeholder) + sabotage (rigged gear self-damages the NPC at combat start) +
  craft (existing melee weapons from scrap). **Comércio:** haggle (warms disposition → existing discount)
  + appraise (PDA market read). **Trigger:** chat emote only.

## Architecture
- **Classifier** (`PromptBuilder.buildActionClassifierPrompt` + `EmoteIntent.parseActionClassification`):
  `ActionClassification` gains `effect` (14-value `SkillEffect`), `target2`, `dir`; tolerant parse,
  `effect:'none'` = legacy behaviour.
- **Pure engine** `src/systems/skills/SkillActions.ts`: `resolveSkillAction(input, rng)` → gate +
  resisted/surprise + power-ratio check → a list of `SkillMutation`. 100% covered, RNG-injected.
- **Pure helpers** `src/systems/skills/Crafting.ts` (recipes + `sabotageDamage`), `src/systems/pda/Pda.ts`
  (`buildPdaState`/`upsertPdaEntry`). `CharacterStats.maxHpFor`/`isHacker`.
- **Browser glue (istanbul-ignored)** in `GameWorldScene.applySkillEffect`/`applySkillMutation`: builds
  the engine input from stats/inventory/target, applies mutations (steal via `Inventory.transferTo` /
  `Economy`, disposition/relationship via the ledger, heal on pervasive HP, `beginCombat` ambush,
  sabotage flag, PDA dossier), narrates (TTS), learns by doing, seeds the tamper trace.
- **NPCAgent**: pervasive `Health`, `TamperTrace` (seed/clear/restore), sabotage flag, `improveRelationship`.
- **NPCManager**: `resolveTamperNotice` (pure) + `detectTampering` (service-free, in `tickAutonomy`);
  persists `health/tamper/sabotaged` in `NPCMemoryEntry`.
- **PDA**: `PdaOverlay` + `SaveGame.pda`/`GameSession.pda` + ribbon "PDA" button + `KeyP`.

## Per-skill mechanic
Combate C-a-C / Armas de Fogo → ambush combat · Atletismo → run speed (passive) + `traverse` ·
Resistência → max HP (passive) · Furtividade → `steal` item (surprise) · Pilotagem → nave speed (passive) ·
Percepção → defends theft + low-tier scan · Information Technology → `info`/`steal`(wire)/`relationship`/
`attack` (deck-gated) · Engenharia → repair/sabotage/craft · Medicina → self-exam + `heal` ·
Persuasão → disposition↑ + relationship · Intimidação → `coerce` · Comércio → haggle + appraise.

## Deferred / notes
- Perk mechanical effects still `effectPending` (separate pass). Repair is a placeholder (no durability).
- NPCs use the uniform `enemyStatsFor` block for defensive values (per-NPC stat blocks remain owner-cancelled).
- Sabotage fires at combat START (drawing the rigged weapon), not mid-fight, to avoid touching the pure combat engine.
- Lesson: JS `\b` is unreliable around accented letters (`pá`) — anchor with `(?<![a-zà-ú])…(?![a-zà-ú])`.
