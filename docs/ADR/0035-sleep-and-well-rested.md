# ADR-0035 — Sleep in beds + temporary "Well Rested" buff

**Status:** Accepted (owner-decided)
**Date:** 2026-06-14

## Context

The survival loop (Hunger, ADR-0022; HP regen/drain) and the learn-by-doing loop
(skill/attribute gains, ADR-0033) had no way to *rest*. Beds existed as scenery
(authored interiors and procedural props) but were inert. The owner wanted beds
to be interactive in a way that (a) advances time meaningfully, (b) ties into the
existing hunger→HP physiology rather than being a free full-heal, and (c) rewards
resting with a short, deliberate boost to progression.

## Decision

### Model (owner-decided), pure `SleepSystem`

`src/systems/SleepSystem.ts` (no Babylon dependency, 100% tested):

- **[E] Sleep** advances the `GameClock` by **8 game-hours**
  (`SLEEP_DURATION_SECONDS`) and simulates that span's physiology in one step —
  `computeSleepResult({hunger, health})`:
  - metabolises up to **~33 hunger** (`SLEEP_HUNGER_COST`, ≈ a third of a full
    belly), and
  - **heals HP 1:1 from the hunger spent**, capped at the missing HP — i.e. you
    only heal if you went to bed fed; hunger hitting 0 mid-sleep just stops the
    healing. HP is never *lost* by sleeping.
  Pure: returns fresh `Hunger`/`Health` states, never mutates inputs.
- **"Well Rested" buff** for **2 game-hours** (`WELL_RESTED_SECONDS`):
  `sleepGainMultiplier(now, until)` returns **2×** while active, applied to **all
  learn-by-doing gains** (skills/attributes → perk points) through the single
  `GameWorldScene.gainSkill` seam (ADR-0033). `wellRestedUntil` / `isWellRested`
  compute/expire it.
- **Cooldown**: once per **24 game-hours** (`canSleep` / `sleepCooldownRemaining`
  vs `SLEEP_COOLDOWN_SECONDS`).

Times are `gameTimeSeconds` (1 game-hour = 3600).

### Bed detection + UI

- Pure triggers (`src/systems/world/SceneDocToTile.ts`): `isBedModel(prop)`
  (model path contains `bed`), `sleepTriggersForTile(doc, tx, tz)` → world-space
  `WorldSleepTrigger` AABBs, and `sleepTriggerHit(pos, triggers)`.
- **Interiors** build the trigger from the bed GLB's **real-world bounding box**
  (`src/systems/world/InteriorRuntime.ts`) so it's pivot-proof (Lesson 21);
  procedural tiles use a generous AABB around the prop.
- `src/systems/SleepOverlay.ts`: pure overlay state (an accelerated clock that
  counts forward 8h during a short fade-to-black animation) + a `UiStyle` neon
  modal (browser-only render); i18n EN/pt-BR (`sleep.*`).

### Persistence

`SaveGame.lastSleepGameTime` (cooldown) and `wellRestedUntilGameTime` (buff
expiry), carried by `GameSession`; `undefined` = never slept / no active buff.
`SaveService.migrate` leaves them undefined for legacy saves (no backfill needed
— `undefined` is the correct "never slept" state). The buff is re-derived from
`wellRestedUntilGameTime` vs the loaded `gameTimeSeconds`, so it survives a
save/load mid-buff.

## Consequences

- Beds become a deliberate rest action that couples time, hunger and HP — no free
  heal; resting fed is rewarded, resting starving is not.
- A short, opt-in progression accelerator (2× for 2h) gives the learn-by-doing
  loop a "train after a good night's sleep" rhythm, surfaced by the ADR-0033 gain
  toasts.
- Two small optional save fields; old saves load unchanged.
- Pure `SleepSystem`/trigger math is fully tested; the overlay render is the only
  browser-only / `istanbul ignore`d part.

## Source

`src/systems/SleepSystem.ts`, `src/systems/SleepOverlay.ts`,
`src/systems/world/{SceneDocToTile,InteriorRuntime}.ts`,
`src/scenes/GameWorldScene.ts`, `src/core/GameSession.ts`,
`src/systems/{SaveService,I18n}.ts`.
