# ADR-0021 — Inventory + items (melee weapons, consumables, corpse loot)

**Status:** Accepted (Fase 9) — **merged to `main`, owner-validated in Electron**
(1053 tests, ~98/90 coverage). Builds on the tactical combat of
[ADR-0020](0020-tactical-multicombatant-combat.md) and the RPG foundation of
[ADR-0016](0016-rpg-stats-power-ratio-checks.md).

## Context

Two combat "deferred" items needed an item layer: the corpse of a defeated NPC
was only a diegetic "search the body" stub with no loot, and combat had no notion
of an **equipped weapon** — hit damage and melee reach were fixed constants
(`MELEE_BASE`/`DAMAGE_VARIANCE`/`MELEE_RANGE` in `CombatMath`). This phase adds a
minimal **item foundation**: an inventory, **melee weapons** that drive combat
damage/reach, **consumables** (medkit → heal), and **loot/misc**, plus real
corpse looting.

Decisions locked with the owner:

- **Inventory = a flat list of stacks with a single weight ceiling.** One stack
  entry per item id, capped at the item's `maxStack`; a single equipped melee
  weapon. No spatial grid. Default capacity 30.
- **No firearm this phase.** Only **melee weapons + consumables + loot/misc** ship.
  Combat stays melee (`CombatCapabilities.firearm = false`; Shoot/Reload stay
  hidden). `WeaponDef.attackKind` already models `'ranged'`, so a gun can be added
  later without reshaping the data, but **no ammo model / Shoot / Reload / economy**
  is implemented now.
- **Empty starting inventory.** The player begins unarmed (bare fist) and acquires
  everything through **corpse loot**. NPC `loadout` is what becomes loot.
- **UI = an overlay on key `I`** (freezes the world like pause/combat); no dedicated
  scene.

## Decision

- **Pure data:** `src/entities/items/ItemCatalog.ts` — `ITEM_REGISTRY`
  (melee/consumable/misc, with weight/stackable/maxStack and a consumable `heal`)
  and `WEAPON_REGISTRY` (attackKind/skill/damageBase/variance/range), frozen
  records + lookup helpers (`itemDef`/`weaponDef`/`isWeapon`/`itemWeight`/
  `itemMaxStack`/`weaponProfile`), mirroring `CharacterStats.SKILLS`.
- **Pure value object:** `src/entities/Inventory.ts` — stacks, weight, equip,
  weight-respecting `add`/`transferTo` (corpse loot), serialize round-trip. 100%
  covered.
- **Weapon-driven combat:** `CombatMath` gains `WeaponProfile` + `FIST_PROFILE`
  (the bare fist reproduces the legacy constants exactly) + `rollWeaponDamage`.
  `CombatantInit.weapon` (defaults to fist) drives hit damage and melee reach in
  `CombatEncounter`. `ItemCatalog.weaponProfile(weaponId)` resolves a profile
  (null/unknown/non-weapon → fist), keeping the dependency one-way
  (`ItemCatalog → CombatMath`, no cycle). The player combatant is armed from the
  equipped weapon; an NPC from its loadout.
- **Persistence:** `SaveGame.inventory` (+`migrate` backfills empty), carried by
  `GameSession`; NPC inventory persists in `npcMemory.inventory` so a looted corpse
  stays looted across reloads. Same pattern as `playerHealth`/stats.
- **NPC loadout:** `NPCDefinition.loadout` builds an `NPCAgent` inventory
  (auto-equips the first weapon). Seeded Mback (knife) and Zara (pipe).
- **UI:** `src/systems/InventoryOverlay.ts` — pure state/actions (equip/unequip,
  use consumable → `onHeal`, drop, loot take/takeAll, row listings) fully unit
  tested; the Babylon GUI is browser-only/istanbul-ignored. `KeyI` →
  `'inventory.open'` (manage); searching a corpse opens it in **loot** mode.

## Consequences

- A knife/pipe out-damages a fist; an NPC carrying a weapon hits harder; killing
  an NPC and looting its weapon is a real progression loop. Unarmed combat is
  byte-for-byte unchanged (fist profile = old constants).
- **Playtest fixes (Electron):** the combat log now names the weapon ("… HITS …
  with Knife" / "with fists") — the attacker's `weaponName` rides on the attack
  event (`CombatEncounter` → `CombatController` → `objectiveLogLine` → i18n), not
  re-derived at render. Closing the loot overlay restores the follow camera
  (`onClose` → `exitConversationMode`), since looting framed the corpse.
- **Deferred:** firearms + ammo + Shoot/Reload, scenery cover, the Zara shop /
  credit economy (credsticks are inert loot for now), implants, item rarity/tiers.
- i18n: EN/pt-BR strings for the overlay + item names. Coverage stays at the gate
  (pure model/actions 100%; overlay/loot GUI istanbul-ignored).
