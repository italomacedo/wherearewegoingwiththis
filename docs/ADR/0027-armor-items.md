# ADR-0027 — Armor items (region-swap pieces + per-piece damage reduction)

**Status:** Accepted — Fase 15 implemented on branch `feat/armor` (awaiting Electron playtest + merge).
1238 tests, ~97/90 coverage, typecheck + build green.

## Context

After modular avatars (Fase 12, [ADR-0024](0024-modular-avatars.md)) the avatar composes **head + top +
bottom** from different Quaternius molds via `avatarPieces`. Some molds are clearly armor — ♂ `swat`
(tactical) / `spacesuit` (space); ♀ `w_soldier` (tactical) / `w_scifi` (space) — each providing a helmet
(head), an armored top and armored legs. The owner wanted these **removed from the character creator** and
turned into **armor items** obtained in play (vendor/reward/loot). Equipping a piece swaps the avatar's
matching region and grants **damage reduction**; customization is unharmed (≈9♂/8♀ molds × 3 regions still
combine, plus the armor pieces enter via gameplay).

## Decisions (owner-locked)

- **Per-piece damage reduction (additive).** Tactical full set = **25%**, space full set = **50%**; a
  single piece grants a **third** of its tier (`armorPieceReduction = fullSet/3`). Total = sum of worn
  pieces, capped at **0.9** (mixing tiers sums proportionally).
- **3 separate equippable pieces**, one per avatar region: Helmet (`head`), Vest (`top`), Greaves
  (`bottom`). Each occupies the matching new `EquipSlot`.
- **Mold resolved by gender at render** — an armor item carries only `armorTier` + `armorRegion`; the
  donor mold is `ARMOR_MOLDS[tier][gender]` (♂swat/♀w_soldier, ♂spacesuit/♀w_scifi). So just **6 logical
  items** (3 regions × 2 tiers), not 12.
- **Player-only reduction this phase** — an NPC wearing an armor mold does **not** get reduction (balance;
  deferred).

## Implementation

- **Data (pure)** `ItemCatalog.ts`: `EquipSlot += head|top|bottom`; `category:'armor'`; `ItemDef`
  `armorTier`/`armorRegion`; 6 items `armor_{tac,spc}_{head,top,legs}`; `ARMOR_MOLDS`, `ARMOR_SLOTS`,
  `ARMOR_OUTFIT_KEYS`, `armorMoldFor`, `armorPieceReduction`, `armorOverlayParts`, `isArmor`,
  `itemArmorTier`/`itemArmorRegion`/`itemDamageReduction`.
- **Inventory** `Inventory.ts`: `equippedArmorIds()` + `totalDamageReduction()` (sum, cap 0.9). Armor
  rides the existing slot map → **persists in `SaveGame.inventory`** (no new save field).
- **Render overlay (pure)** `CharacterData.applyArmorOverlay(base, regionMolds)`: returns a CLONE with
  armor molds overlaid on `avatarPieces` — the **saved appearance is never mutated**, so unequipping
  reverts to the base look.
- **Runtime rebuild (browser)** `PlayerController.rebuildAppearance(appearance)`: re-assembles the rig in
  place (dispose old → reassemble → reparent → re-anim), keeping root/physics-capsule/position. There was
  no in-game avatar rebuild before (the creator rebuilt; `spawn` built once).
- **Scene wiring** `GameWorldScene.rebuildPlayerArmor()`: `armorOverlayParts(inv.equippedArmorIds(),
  gender)` → `applyArmorOverlay` → `rebuildAppearance` → recreate the `HeldItemRig` against the new
  skeleton → re-sync props. Driven by the overlay's `onEquipArmor`; also applied after spawn on load.
- **Combat** `CombatEncounter`: `CombatantInit.damageReduction` (0..0.9) reduces a hit's rolled damage at
  the single HP sink; `GameWorldScene.beginCombat` sets the player's from `totalDamageReduction()`.
- **Creator** `CharacterCreatorScene.selectableKeys` filters `ARMOR_OUTFIT_KEYS` from the outfit + 3 part
  cyclers + `setGender` default. NPCs/assembler are unaffected (molds still loadable).
- **i18n** EN/pt-BR names for the 6 pieces; armor reuses the existing equip/unequip labels.

## Consequences

- Armor is loot-driven gear with a clear power axis (tactical → space) and a visible avatar change.
- The new `PlayerController.rebuildAppearance` is reusable for any future in-game appearance change.
- Coverage: data/overlay/inventory/combat reduction are pure + 100% tested; the avatar reassembly +
  scene wiring are browser-only/`istanbul ignore`d.

## Deferred

- NPC armor (reduction for armored NPCs), armor weight→encumbrance, armor durability/tiers beyond the two,
  mixing armor regions with non-armor recolor, per-piece visual variants.
