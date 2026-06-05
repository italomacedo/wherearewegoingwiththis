# ADR-0030 — Skill Mechanics via Deterministic Chat Actions (all 13 skills)

**Status:** Accepted — Fase 20 A–J **MERGED to `main`**, owner-validated in Electron (all 16 checklist blocks passed). 1506 tests, ~96.85/90.09 gated.
**Date:** 2026-06
**Builds on:** ADR-0016 (stats/power-ratio checks), ADR-0018 (autonomy/deliberation), the emote→check pipeline.

## Post-playtest revisions (locked by owner)
1. **Attribute model:** 1×40% primary + 1×30% secondary + 2×20% (was 1×30% + 3×20%). Creator buttons cycle `20 → 30 ◆ → 40 ★ → 20` per click — 1st click introduces as secondary, 2nd promotes to primary; promotion preserves the pair (the demoted ex-primary takes the secondary slot). `setPrimaryAndSecondaryAttributes` is the new pure helper; `setPrimaryAttribute` kept as legacy 1-tier shortcut.
2. **Perk picker** iterates `unlockedTierCount(attr%)` per attribute (no longer hard-coded tier-1) and **re-renders on every attribute cycle** — the 40% primary moves the tier-2 slot around, so the picker must follow. Without this, `canBegin` was unsatisfiable (Lesson 52).
3. **Physical-contact reach:** `SKILL_CONTACT_RADIUS = 2 m` for `steal` (Furtividade), `sabotage`, and `heal` on another NPC; `SKILL_ACTION_RADIUS = 30 m` for everything else. New pure `reachFor(effect, skillId)` decides per call.
4. **Caught red-handed on failed pressure:** `effect ∈ {steal, coerce}` OR (`effect=disposition && skillId=intimidacao`) and `!res.success` → `onHostilePlayerAction` (worsens disposition one step, forces hostile state). Persuasion failures (`disposition+persuasao`) do NOT punish.
5. **PDA is live, not a snapshot:** the `info` scan unlocks the entry; dossier lines (role/disposition/credits/inventory) are re-read from the live agent on every `openPda`. Defeated NPCs get a red rotated "DECEASED" stamp on the card.
6. **Remote attack via IT hack:** `SkillMutation.begin_combat` carries `remote: boolean`; the scene passes `noLunge: true` to `beginCombat` so the player isn't teleported into the target's face when triggering combat via an IT-effect attack (vs the Phase-11 melee surprise lunge).
7. **NPC mutable state ALL goes through `NPCMemoryEntry`:** added `position`/`nameKnown`/`tamper`/`sabotaged`/`health`. Authored cast (Zara/Mback) now routes through `spawnWithMemory` (not the old manual restore loop) — single source of truth (Lesson 51).
8. **Dead NPCs are out of scope** for chat addressing (`buildAddressCandidates`) and for NPC↔NPC deliberation (`nearbyCandidatesFor`) — they're only reachable via `[E] Search the body`.
9. **`oneShot` system prompt:** every Claude one-shot (narrate/classify/intent/gossip) now sets a small `ONE_SHOT_SYSTEM` ("game-engine narrator/classifier… never break character, never mention you are Claude…") to prevent the default Claude-Code identity from leaking mid-narration (extension of Lesson 40 → Lesson 50).
10. **Creator gating:** `canBegin()` requires primary + secondary + valid skill allocation (2+3) + a perk in every unlocked perk slot (4 tier-1 + the tier-2 of the 40% primary, whichever attribute that is). BEGIN button is disabled and dimmed until satisfied.

## UI unification (Fase 20 closeout)
All modal screens and overlays now share one visual identity via `src/systems/UiStyle.ts` (tokens for paletes/raios/fonts/header height): **scrim** (dim full-screen) + **centred frame** (neon-bordered, rounded) + **header strip** (accent line at the base, title left, primary action right) + **ScrollViewer** when needed (no `calc()` — Lesson 48). Applied: MainMenu (buttons only, cityscape preserved), LoadGame, Options (with tabs + scroll), CharacterCreator (begin/back), PauseMenu, GameOverMenu (red palette for mood), InventoryOverlay (header + Close), AdjustOverlay (bottom bar). Branding (Splash/Studio/Publisher) and HUD/Ribbon/Dialog kept their existing identities (they don't fit the modal pattern).

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
