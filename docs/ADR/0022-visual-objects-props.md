# ADR-0022 — Visual objects & props (held items, paper-doll, hunger, flashlight, firearms)

**Status:** Proposed / IN PROGRESS (Fase 10) — on branch `feat/objects-props`
(NOT merged). Builds on the inventory/item foundation of
[ADR-0021](0021-inventory-items.md). ~1115 tests, coverage gated 95/90, typecheck +
build green per commit.

## Context

ADR-0021 gave items a **mechanical** layer (weight-capped inventory, melee weapons
driving combat, consumables, corpse loot) but everything was textual: items never
appeared on the avatar, there was no hunger/food, no flashlight/phone, and the
inventory was a button list. Fase 10 makes the objects **visual & physical** using
two CC0 packs (Survival Pack + Ultimate Food Pack) and the existing Quaternius rig.

Owner-locked decisions (see the plan `quero-fazer-um-jogo-dreamy-firefly.md`,
SUBPLANO Fase 10): hunger is **diegetic** (no HUD bar; a "stomach growling"
narration line); animations **reuse the embedded Quaternius clips** (Sword_Slash for
melee swing, Idle_Gun_Pointing for aim, Interact for eating); firearms are
**cosmetic only** (attach + aim pose, no shooting/ammo); paper-doll = **2 slots**
(right hand + back); the Adjust tool persists attach transforms **per-save**.

## Decisions

- **Item data + equipment slots (pure):** `ItemDef` gained optional
  `modelPath / equipSlot('main_hand'|'back') / capacityBonus / hungerRestore /
  attach{pos,rot,scale,bone} / holdClip` (`src/entities/items/ItemCatalog.ts`), plus
  lookups (`itemModelPath/itemEquipSlot/itemCapacityBonus/itemHungerRestore/
  itemAttach/isMeleeWeapon/isFirearm`). New items: extra melee (axe/shovel), cosmetic
  firearms (pistol/revolver/shotgun — ranged), backpack (+20 kg), flashlight (a melee
  bludgeon too), phone, foods. `Inventory` (`src/entities/Inventory.ts`) moved from a
  single `equippedWeaponId` to an `equipped: Partial<Record<EquipSlot,string>>` map
  (`equipToSlot/unequipSlot/equippedIn`); `equippedWeaponId`/`getCombatWeaponId` are
  now **derived** = the main-hand item only when it is a MELEE weapon (a flashlight is
  melee → arms; a firearm is ranged → fists; keeps combat melee-only). `effectiveCapacity()`
  = base + equipped `capacityBonus` (backpack).
- **Hunger (pure):** `src/entities/Hunger.ts` — `tick(dt, hpFull)` converts hunger→HP
  at 0.1%/s while HP<max, holds at full HP, drains HP at 0.01%/s when starving;
  `feed`/`isLow`/`isStarving`. Persisted `SaveGame.playerHunger` + GameSession +
  migrate. Ticked per-frame in `GameWorldScene.tickHunger`; a low-hunger edge fires a
  diegetic `hunger.growl` line via the gossip/narration channel.
- **Assets:** `scripts/convert_assets.py` (Blender) converted a curated subset into
  `public/assets/items/**` (~716 KB): knife/axe/shovel, pistol_1/revolver_1/shotgun_1,
  torch (flashlight), phone, backpack, firstaidkit (medkit) + 8 foods. Per-item
  `attach.scale` derived from each GLB's **measured bounding box** (pack meshes are
  authored large — knife ~0.79 u, axe ~29 u).
- **Held-item attach (`src/systems/HeldItems.ts`):** pure `heldPropsFor` + bone map
  (`Wrist.R` hand / `Chest` back on the Quaternius rig) + per-save override resolution
  (`resolveAttachWith/boneFor`); browser-only `HeldItemRig` diff-loads each occupied
  slot's GLB and `attachToBone`s it (+ a transient in-hand slot for phone/food). Wired
  for the player AND NPCs (NPC weapon shows in hand).
- **Adjust tool (10.4b):** in-game calibration — `AttachAdjuster` (pure: nudge
  pos/rot/scale, cycle bone) + `AdjustOverlay` (toolbar). Opened by an **"Adjust"
  button per equipped row** in the inventory (or `O`); camera frames the hero with
  free wheel-zoom (`CameraSystem.setWheelZoomEnabled`) + Z/C orbit. Saves the tuned
  `{bone,pos,rot,scale}` **permanently into `SaveGame.heldAttach`** (owner's choice).
- **Combat swing:** `AvatarMeshCatalog.COMBAT_CLIPS` += `slash:'Sword_Slash'` (kept by
  `assembleGltf`); `attackClipFor(kind, armedMelee, override)` → armed melee = slash,
  fists = punch, ranged = shoot. The equipped weapon stays bone-attached through the swing.
- **Flashlight:** equipping it auto-lights a forward `SpotLight` parented to the hero
  (no toggle key) + aim pose; doubles as a weak melee weapon.
- **Firearm (cosmetic):** attaches + holds the aim pose (`holdsAimPose` = flashlight or
  firearm); never shoots (ranged → fists in combat).
- **Road rework (visual fix, not in the original subplan):** the starting street's
  asphalt was a flat zero-thickness plane that rendered black and blew out under light.
  Replaced by making the **zone ground plane itself the asphalt** (lit, seamless,
  mid-dark grey) + **emissive road markings** (dashed centre line + 2 crosswalks) in
  `MercadoSombrasZone`. The MegaKit `street_4lane` tile was tried and dropped
  (directional + flat-normalled → unreliable orientation/coverage under the glTF
  import wrapper).

## Consequences

- Equipped items are visible on the avatar (player + NPC) at calibrated transforms
  that persist per save; the flashlight lights the world; eating plays an animation
  and feeds hunger; the street reads as a lit road.
- **Lessons (added to CLAUDE.md):** (a) a flat zero-thickness plane often imports with
  downward normals → renders black/unlit; use a thick slab or a `CreateGround` (faces
  up). (b) Babylon's per-material light cap defaults to **4** — extra lights (a
  flashlight beyond the street neons) are silently dropped; raise
  `maxSimultaneousLights` on all materials (incl. an `onNewMaterialAddedObservable`
  hook for async-loaded assets). (c) Non-uniform scale + rotation on an imported tile
  can break its lighting (normals) — prefer uniform scale, or procedural emissive
  paint for road markings (ignores lighting/normals). (d) Derive held-prop scale from
  the GLB's measured bounding box, not by eye.
- **Deferred / open (as of this checkpoint):**
  - **10.7 firearm** — code complete, **awaiting Electron playtest**.
  - **10.11 muzzle-flash** — forward-looking only (no shooting yet); not built.
  - **10.9 phone + Claude lore chat** — **on hold** (owner).
  - **10.10 drag-and-drop inventory paper-doll** — **cancelled** (owner); the
    button-based inventory + the Adjust button stay.
  - Firearms/ammo + Shoot/Reload, ranged combat, the phone lore screen.
- **MUST do before any merge:** remove the temporary `DEBUG_TEST_LOADOUT` seed in
  `GameWorldScene` (starts the hero with knife+backpack+flashlight+pistol+burger for
  playtesting; the real game starts with an empty inventory).
