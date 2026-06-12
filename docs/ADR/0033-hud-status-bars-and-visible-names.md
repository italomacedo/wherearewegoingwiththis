# ADR-0033 — HUD status bars (HP/Stamina/Hunger + gain toasts) and always-visible NPC names

**Status:** Accepted (owner-decided)
**Date:** 2026-06-12

## Context

Two early immersion decisions were owner-reverted after extended play:

1. **No on-screen HP bar** (F1): the player's condition was diegetic-only
   (self-exam emote / medic NPC). In practice the player flew blind on the
   pressures acting on the character (HP, hunger) and never saw the
   learn-by-doing skill gains happening at all (they were completely silent).
2. **NPC names hidden until introduced** (Lesson 14, `nameKnown`): the
   anti-metagaming rule forced the player to ask "who are you?" of every NPC,
   which got tedious — especially with the procedural world's many NPCs.

## Decision

### 1. Status-bar stack + gain toasts (WorldHud)

- **Three compact bars top-left** (150×10 px, track+fill `Rectangle`s — the
  Lesson-48 `%`-width pattern, no `calc()`) on a **neon card panel** in the
  product visual identity (`UiStyle` tokens — new `barTrack`/`hpHigh`/`hpMid`/
  `hpLow`/`warnOrange`): each row has a small `UI.textMeta` label
  (`hud.hp`/`hud.stamina`/`hud.hunger` — "HP"/"STA"/"HUN"·"FOME", i18n).
  **HP** (green >50% / amber >25% / red, `WorldHud.healthBarColor`), **Stamina**
  (cyan `UI.accent`), **Hunger** (`UI.warnOrange`). The vehicle status line
  moved below the stack (top 96). Bars + panel follow `hudTextVisible`
  (hidden during combat, which owns the screen).
- **Gain toasts**: a pure `ToastQueue` (`src/systems/hud/ToastQueue.ts`, TTL 3 s,
  max 4, injected timestamps) rendered as right-aligned card-backed rows
  (`UI.cardBg`/`cardBorder`/`cornerSm`, `UI.textPrimary` text) that fade out.
  Every player skill check routes through one scene seam
  (`GameWorldScene.gainSkill`) that applies `applySkillUse`, toasts
  `"{skill} +0.1"`, and grants perk points (toasting `"+1 Perk Point — {attr}"`).
  Direct calls, no EventBus — all call sites already live in the scene.
  Toasts are NOT gated by `hudTextVisible`, so combat gains stay visible.
- **Universal learn-by-doing (owner-decided in the follow-up pass)**: EVERY
  player-ROLLED check grants the skill + its governing attribute gain,
  **success OR failure** — the old "only on success" rule is retired. This
  includes **combat**: every player attack beat (hit, miss or kill) trains the
  weapon skill (`combate_corpo_a_corpo` melee / `armas_de_fogo` ranged) via the
  `onCombatBeat` hook (spectator fights use playerId `'__none__'` → no gain).
  The verbal pipeline (Resolver) already emitted `apply_skill_use`
  unconditionally; the emote/hostile/skill-effect scene paths were unified to
  match (`rolled`-gated, not success-gated).
- **Deterministic check line in chat**: every player-rolled check posts an
  out-of-world `system` line to the dialog transcript —
  `"Furtividade: 23 vs 65% — FALHA"` (`+ "· CRÍTICO"` on a crit) — via the pure
  `checkLine` formatter (`src/systems/skills/CheckLine.ts`, i18n
  `skill.checkLine`/`checkSuccess`/`checkFailure`/`checkCrit`) and the
  `showCheckLine` scene glue. It states only the roll outcome, never the world
  mutation. Call sites: emote no-effect, skill-effect (incl. medicine
  self-exam), hostile, and verbal (skillId recovered from the
  `apply_skill_use` mutation). Combat is already covered by the combat log.

### 2. Stamina — a NEW sprint-energy system

`src/entities/Stamina.ts` (pure value object, modelled on `Hunger`):

- Sprint (Shift) **drains 12/s while sprinting AND moving**; regenerates 16/s
  otherwise. Base reserve 100.
- Hitting 0 sets an **exhausted latch**: sprint stays disabled until stamina
  recovers to **20% of max** (hysteresis — no flapping at the empty mark).
- **Atletismo scales the reserve** with the same curve as run speed
  (`×(0.85 + atletismo/200)`: ×0.9 @10, ×1.0 @30, ×1.35 @100), applied by
  `PlayerController.setAtletismo` → `setMaxForAtletismo` (fraction-preserving).
- `PlayerController.update` gates sprint on `stamina.canSprint()` and exposes
  `isSprintActive()`; the kinematic and physics paths both inherit the gate via
  `computeDisplacement`'s `sprint` flag.
- **Persisted** as `SaveGame.playerStamina` (`{current,max}`; `migrate()`
  backfills legacy saves full) and carried by `GameSession.playerStamina`.
  The latch is NOT saved — `fromState` re-derives it from the saved fraction.

### 3. NPC names always visible

The whole `nameKnown` mechanism is removed:

- `NPCAgent.getDisplayName()` is now a trivial alias for `definition.name`
  (kept as a method so ~20 call sites stay stable); `isNameKnown` /
  `markNameKnown` / `restoreNameKnown` / `revealNameIfMentioned` deleted.
- `NPCMemoryEntry.nameKnown` dropped (old saves carrying the key are tolerated
  — it's an ignored extra property).
- `Addressing.AddressCandidate.nameKnown` dropped: the player can address any
  in-reach NPC **by name** in global chat (T) immediately.
- Scene: the reply reveal hook, the PDA-scan `markNameKnown`, and the
  conditional `[E]` prompts are gone — prompts always show the real name;
  orphaned i18n keys (`hud.talk`, `hud.search`, `inventory.corpseUnknown`)
  removed.
- The prompt builder never hid names from Claude, so NPC behaviour is unchanged.

## Consequences

- HUD now communicates the three survival pressures at a glance plus live RPG
  progression feedback; the diegetic channels (self-exam, stomach growl, medic)
  still work and remain the *narrative* source.
- Sprint is a managed resource for the first time; Atletismo gains both speed
  and endurance, strengthening the learn-by-doing loop (visible via the toasts).
- One fewer persisted NPC field; saves shrink slightly. Legacy saves load
  unchanged (stamina backfilled full).
- Lesson 14's anti-metagaming rule is retired (kept in CLAUDE.md as historical,
  marked reverted).
