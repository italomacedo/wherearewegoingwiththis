# ADR-0023 — Action ribbon, surprise attack & real ranged combat

**Status:** Accepted (Phase 11) — on branch `feat/objects-props` (continues Phase 10).
Builds on the tactical combat of [ADR-0020](0020-tactical-multicombatant-combat.md) and
the inventory/items of [ADR-0021](0021-inventory-items.md) / [ADR-0022](0022-visual-objects-props.md).

## Context

Player actions only existed as keys (E talk, T chat, I inventory) and **attacks
only happened *inside* combat**, provoked by a hostile emote in chat. The owner
wanted a always-visible **action ribbon** to click **Attack Ranged · Attack Melee ·
Talk · Inventory**, and attacking *outside* combat to work as a **surprise attack**
(click Attack → click the target avatar → resolve the blow → the target reacts and
combat begins). Seeing a **muzzle-flash** (deferred 10.11) required **real ranged
firing**, which until now was cosmetic-only (combat was melee-only). Separately, the
existing **combat action bar overlapped the on-screen key hints**, and those hints
were **outdated**.

## Decisions (owner-locked, jun/2026)

- **Action ribbon = 4 buttons** (`src/systems/ActionRibbon.ts`): Attack Ranged ·
  Attack Melee · **Talk (single button — opens the chat)** · Inventory. "Act/emote"
  folded into Talk (the speech-vs-emote split stays in what the player types). Pure
  `ribbonButtons(hasFirearm)` gating + `press(key)` dispatch (tested); Babylon GUI
  bar bottom-centre, browser-only. **Attack Ranged enabled only with a firearm in
  hand**; the others always (melee falls back to fists).
- **Surprise attack = ambush (guaranteed first turn).** Clicking an attack enters
  out-of-combat aiming (`SurpriseTargeting` pure helpers + a scene pointer observer);
  a click on an NPC **within reach** (firearm range for ranged, 1 m for melee) starts
  combat with the player as the **ambusher** — `CombatEncounter` accepts an
  `ambusherId` that takes the very first turn regardless of Dexterity. The opening
  strike/shot is auto-applied as the player's first action (plays the swing/muzzle-
  flash, deals damage, spends AP); the player keeps the rest of their turn.
  **Premise:** attacking someone **always** starts combat (the target becomes an
  enemy; `CombatRecruiter` decides who else joins). "The target declines / flees" is
  left to the combat AI (flee), not a separate no-combat path.
- **Real ranged firing, no ammo.** The player/NPC combat weapon is now the **main-hand
  item if it is ANY weapon** (`Inventory.combatWeaponId` — melee OR firearm), and the
  player's `CombatCapabilities.firearm` is derived from `isFirearm(mainHand)` (was a
  fixed `MELEE_ONLY_CAPS`). The pre-existing ranged `resolveAttack` + `attackKind`
  path now drives damage/hit. **This revokes the "firearm cosmetic-only" of Phases
  9/10.** Ammo / Reload stay deferred (no consumption). NPCs decide ranged vs melee
  **per their own weapon** (`CombatEncounter.weaponOf` → `CombatController.aiActionFor`),
  so a knife-armed ally melees even when the player carries a gun.
- **Ranged reach = the weapon's range** (`WEAPON_REGISTRY`: pistol 20 m, revolver
  22 m, shotgun 12 m). New pure `targetRangeFor(kind, weapon)`: ranged → `weapon.range`,
  melee → `MELEE_RANGE` (no "pistol-whip across the street"). Used by both the in-
  combat targeting ring and the surprise-attack ring. Line-of-sight/obstacles deferred.
- **Muzzle-flash live (was 10.11).** `ParticleEffects.createMuzzleFlash` (pure
  `muzzleFlashConfig` + browser `ParticleSystem` burst, modelled on the vehicle smoke:
  `manualEmitCount` + `disposeOnStop`, short yellow→orange cone). Fired from
  `animateCombatBeat` on a ranged attack, at the shooter's hand height toward the target
  (player + NPC).
- **HUD layout + hints.** Three bottom bands no longer overlap: control hint (-12) ·
  action ribbon (-44) · contextual `[E]/[F]` prompt (moved to -92). `WorldHud`
  `setHudTextVisible(false)` hides the hint + prompt **during combat** so the centred
  combat bar owns the bottom; restored after. `hud.controls` updated to the real
  bindings (WASD · Shift · Z/C · E · T · I · O · F · Space/Ctrl · ESC), EN + pt-BR.

## Consequences

- A firearm is now a real weapon: equip a pistol → the ribbon's Attack Ranged lights
  up → aim (green ring within ~20 m) → click an NPC → shot + muzzle-flash + damage →
  combat opens with the player on the first turn. Melee surprise needs ≤1 m.
- The ribbon mirrors the keyboard for mouse-first play and hides whenever an overlay /
  combat / dialog / aiming / the vehicle owns the screen.
- Combat HUD and key hints no longer collide; the hints reflect the current bindings.
- **Pure/tested:** `Inventory.combatWeaponId`, `weaponOf`, ambush ordering,
  `targetRangeFor`, `SurpriseTargeting`, `ribbonButtons`/dispatch, `muzzleFlashConfig`,
  `WorldHud.setHudTextVisible`. Browser glue (aiming pointer/ring, GUI, particle emit,
  HUD sync) is `istanbul ignore`d. 1129 tests, ~98% / ≥90% branches, typecheck + build green.

## Deferred / still open

- **Ammo + Reload** (no consumption yet; Reload inert), per-NPC stat blocks, scenery
  cover, line-of-sight/obstruction for ranged, Zara shop/economy.
- **`DEBUG_TEST_LOADOUT`** in `GameWorldScene` (knife+backpack+flashlight+pistol+burger)
  is kept for ranged playtesting and **MUST be removed before merge** (real start =
  empty inventory).
