# Where Are We Going With This — Claude Agent Context

**BeiraRio Games | Cyberpunk Isometric Open-World RPG**

This is the primary entry point for all AI agents working on this project. Read this before touching any file.

---

## Current Status (keep this updated)

**Phases 0–8 COMPLETE** (+ gaps #1/#2/#3 closed) · **Phase 9 MVP** (flying motorcycle) · **pause/save + HUD + camera-relative WASD + Z/C & MMB orbit** · **health system (fall damage, bike crash → smoke → explode, game-over, persisted)** · **playable MVP verified in Electron (live Claude NPC chat)** · **Avatar overhaul — [ADR-0014](docs/ADR/0014-avatar-pipeline-makehuman-morphs.md) (+ addendum): **PIVOTED MakeHuman → Quaternius "Ultimate Modular" (CC0)** after MakeHuman's art ceiling/glitches (Addendums 3–4). Avatar = **whole-outfit swap**: each outfit is a complete, rigged, **self-animated** Quaternius character GLB (Punk/SWAT/Suit/Hoodie/Sci-Fi/Soldier… 11 ♂ + 10 ♀) in `characters/quaternius/{men,women}/`. `assembleGltf` keeps the 4 embedded clips (Idle/Walk/Run/Interact) renamed for name-based playback + disposes the rest (no Mixamo/anim-library). Tint by semantic material (`Skin`→skin, `Eye`→eye, `Eyebrows`/`Hair*`→hair) via `tintRoleForMaterial`; clothing keeps authored colours. Creator: Gender · Skin Tone · Eye Color · Outfit ◄► (gender-filtered) · Hair Color. Faces +Z (no flip), creator cam `alpha=+π/2`. `scripts/convert_outfits.py` batch-converts the pack glTF→GLB. **MakeHuman/Mixamo/superhero assets (~326 MB) + dead code removed.** Flying bike loads `vehicles/cyberpunk_harley.glb` via the same guarded-load/fallback. Deferred: per-part outfit mixing, clothing recolour, hero mesh disappears while mounted (separate task)** · **Gap #4 (real world assets) — DONE as a downtown V1 ([ADR-0015](docs/ADR/0015-downtown-assets-and-havok-collision.md)): the first scene is now a closed **downtown street** built from Quaternius CC0 packs (Downtown City MegaKit + Ultimate). Linear street (continuous `street_asphalt_9x9`), sidewalks, MegaKit buildings lining both sides with **doors** in their openings, brick perimeter walls closing the becos, a **black exit wall** at +X (future scene-transition trigger), a dead end at −X. Zara is a **w_punk female avatar** (idle) with a sidewalk vendor stall; the bike became an atmospheric **nave** (small Ultimate Spaceships model). `scripts/convert_assets.py` (generalized) batch-converts FBX/glTF→GLB (`--maxtex` downscales textures, forces opaque). **Havok collision live**: hero driven by a `PhysicsCharacterController`, static box colliders on the perimeter + every solid prop/building + nave + Zara (`MercadoSombrasZone.buildColliders` + `GameWorldScene.buildEntityColliders`); roads/sidewalks walkable. Pure placement data in `src/assets/WorldAssetCatalog.ts`.** · **Living-world track (Fases 1–6 + i18n) + turn-based MELEE combat ([ADR-0019](docs/ADR/0019-turn-based-combat.md)) COMPLETE & on `main`** (see the blockquotes below) · **Fase 8 — tactical combat ([ADR-0020](docs/ADR/0020-tactical-multicombatant-combat.md)) CODE COMPLETE on branch `feat/combat-tactical` (awaiting Electron playtest):** **8A spatial movement** (real 2-D positions; **Move = 1 AP/m routed around obstacles** via a grid-A* `CombatMovement` over the world colliders, green/red on-ground trail preview + click-to-move; melee ≤1 m; **flee** only >10 m; click-an-avatar targeting) + **8B multi-combatant by relationship ledger, no factions** (NPC→NPC ledger on the 4-level scale, persisted; pure `CombatRecruiter` assigns **sides** whole-scene — hostile/wary oppose, friendly defend, ties out; N-way `CombatEncounter` with side win/lose + `resolved`; allies AI-fight for you; **player flee continues the fight**; **intentional friendly fire flips an ally at wary**; **autonomous NPC↔NPC fights + post-flee continuation run live as a paced spectator** — `tickCombat` ~0.7 s/turn, centroid camera). Pure core ~100%/>90% tested; browser istanbul-ignored. **Playtest pass (owner, Electron) — scenario 1 validated** ("attack Mback → Zara joins you" works after the recruiter conflicted-tie fix) + polish applied: **free RTS combat camera** (arrows/WASD pan camera-relative via `panFree`/`getForwardRay`, Z/C orbit, **wheel-zoom only in combat** to block on-foot metagaming; spectator fights keep the centroid camera), **robust attack targeting** (ground-point + nearest-combatant + hover **ring** green=in-range/red=out, no fragile mesh-pick), **fighters face their target before striking** + **per-segment walk facing** (no moonwalk), **enemy nerf** (shared `enemyStatsFor` Dex30/Forca25/skills25/Perc20 + `NPC_COMBAT_HP`=70 so the player can win), **killed NPCs stay dead** (`NPCAgent.markDefeated/isDefeated`; excluded from recruit/autonomy/triggers; hold Death pose — no resurrection), **`[E] Interact`** rename + **searchable corpse** (dead NPC = diegetic "search the body" stub, no live persona; frisk/loot deferred to inventory), **post-combat position sync** (`PlayerController.teleport` recreates the capsule; NPC holder+agent moved so `[E]`/proximity/camera follow). **Bug (A) facing-revert FIXED** + **movement tuning applied**: (A) the single walk-end holder-rotation pin didn't hold (the idle clip re-evaluates the avatar's modelled forward every frame), so facing is now re-asserted **every combat frame** (`pinCombatFacings` in the combat branch of `update()`, skipping mid-walk combatants) from a per-combatant `combatFacing` map seeded at fight start (each faces its `nearestFoeId`) and updated on walk-end / strike; **movement = 0.5 AP/m (1 AP moves 2 m)** so low-Dex allies close distance faster (Options cycles 0.5↔1 AP/m shown as m/AP); **NPC collision = a physics CAPSULE parented to the holder** (the character's own mold, same shape as the hero; `ANIMATED` body + `disablePreStep=false` tracks the holder automatically) — replaced the separate static box that had to be repositioned, so the collider follows the NPC anywhere (combat **and** gossip). **NPC locomotion centralized** into one set of primitives (`moveNpcTo` syncs holder + logical agent so `[E]`/proximity/camera follow; `faceNpc`/`faceNpcToward`; one `startNpcWalk`/`stepNpcWalks`/`finishNpcWalk` polyline walker) used by **both** gossip approaches and combat moves (player included), replacing the old separate `stepNpcMovers` + `walkAlongPath` tween. **ALL playtest bugs validated/closed (owner, Electron):** (B) attack ring alignment fixed by the capsule/centralized positions; (C) **a surviving NPC now learns who died** — `NPCAgent` carries a persisted witnessed-events memory (`rememberEvent`/`getRecentEvents`/`restoreEvents`, deduped, cap 8); on combat end each survivor records a death line (attributed to the player when the player was on the opposing side) that feeds the prompt's `recentEvents` channel (`buildWorldSnapshot`) and persists in `npcMemory.events`, so the survivor brings it up in chat. Flee continuation + autonomous NPC↔NPC fights validated; friendly-fire deprioritized by owner. · **997 tests** · ~98% coverage (gated 95% lines/stmts/funcs, 90% branches) · typecheck + build green. **MERGED to `main`.**

> **Marco "MVP jogável" fechado.** Loop completo: splash→menu→criação→mundo; herói anda (WASD relativo à câmera), conversa com a Zara (Claude CLI ao vivo, com pré-moderação), pilota a moto, toma dano, salva. Aberto: Phase 9 follow-ups (carro/ tráfego), Phase 10 (combate), gap #4 (assets reais).

> **Living-world track — Fases 1–6 + i18n COMPLETE & MERGED to `main` (pushed). Roadmap done. 834 tests, ~98% coverage (gated 95/90), typecheck + build green.** **F1 feel/imersão:** walk `speedRatio`↔ground-speed (no foot slide), HP bar removed (Health kept), cinematic dialog camera (frames + turns the NPC to face the player), rich `NPCDefinition` (home/backstory/routine/relationships/`initialDisposition`). **F2 tempo+chat+emote:** `GameClock` (wall-clock day, **no HUD clock**) + light/fog tint per period; **T** opens chat anywhere (pure addressing resolver: name→aim→ambient, reach by tone, `*shout*`/`*grito*`=whole scene); emote determinism classifier; "check the time" emote. **F3 RPG — [ADR-0016](docs/ADR/0016-rpg-stats-power-ratio-checks.md):** `CharacterStats` (Força/Destreza/Inteligência/Carisma 0–100, 13 skills, 40 perks=5 tiers×2/attr), learn-by-doing (+0.1% on success ×Options mult), **power-ratio k=2** resolution (`SkillCheck`: `P=v²/(v²+opp²)`, one d100<P, ±N modifiers/cover — replaced the high-variance d100), persisted (`SaveService.migrate`), Creator pickers, Options skill-gain mult (1/3/10×). **F4:** deterministic emote → `resolveCheck` → Claude narrates outcome (no numbers) → NPC reacts; self-exam (Medicina) → condition band (coarse always, precise on success). **i18n — [ADR-0017](docs/ADR/0017-i18n-en-ptbr.md):** in-house EN/pt-BR (`I18n.t`, locale in `SettingsService.language`), Options Language toggle (re-translates live), **NPC+narration follow the language** (classifiers stay EN), all UI + RPG labels swept. **Dev:** `ClaudeNPCService` logs each prompt + estimated tokens (`TokenMeter`). **F5 NPCs vivos — [ADR-0018](docs/ADR/0018-living-npcs-autonomy-astar-throttle.md):** two-layer brain = LLM **intent deliberation** (`PromptBuilder.buildIntentPrompt` → constrained menu `stay|approach|attack|react_to_player`; `parseIntent` validates+degrades; `attack`=combat stub) + deterministic **A\*** (`Pathfinding.computeRoute` over `WAYPOINT_GRAPH`, 27-node 3-lane street graph). **Cost safeguard** (token analysis: moderation ~160 / classifier ~245 / NPC turn ~455–542 / deliberation ~315 / gossip ~2.1k tok): `ClaudeCallQueue` (pure, injected clock) gates every autonomous call by min-gap + rolling per-minute cap + per-key cooldown (dedup); **player turns bypass it**. Approved throttle (reflection 8min+jitter, 6s gap, 8/min, 1 gossip) is **configurable in Options** (`npcAutonomy`/`npcReflectionMinutes`/`npcCallsPerMinute`). **Dynamic dispositions** persisted in `npcMemory` (`worsenDisposition`/`onHostilePlayerAction`→ultimatum/`shouldInitiateCombat`). `NPCManager.tickAutonomy` orchestrates; `GameWorldScene` drives it (~1Hz, browser-only) → A* approach → **live on-screen gossip** (`runGossip`, narration lines). **Gossip needs ≥2 co-located NPCs.** A 2nd NPC (**Mback**, corporate fixer vs **Zara** the activist hacker — distinct GLB models `men/suit` vs `women/punk` + antagonistic `relationships` that feed the gossip prompt) was added so gossip surfaces. **Verified in Electron:** deliberation/throttle/dispositions confirmed via token logs; gossip left **emergent** (with the player present NPCs pick `react_to_player`, so gossip is rare — owner accepted). Fixes from verification: an `approach` walks the deliberating agent (not the target) to its target; NPC plays its **Walk** clip while travelling + faces the partner on arrival (`npcAnimById`); `NPCAgent.setPosition` keeps the logical position in sync so **`[E] Talk`/proximity/camera follow the moving NPC**; NPC placeholder gender from the Quaternius outfit key (`genderOfOutfit`, `w_`-prefix = female). **F6 Atmosfera — MERGED:** `AmbientLife` (pure `stepDog` wander + placement data) drives **1 stray dog** (Quaternius CC0 ShibaInu/Husky GLBs in `world/animals/`, Walk/Idle clips — pack has no rat, owner picked a stray dog); **real CC0 cans/bottles** as litter (Survival Pack → `world/trash/*.glb`, `TRASH_MODELS`, ~0.3 scale; replaced procedural boxes); slumped procedural **beggars**; **fog** tints per time-of-day. **Gossip shows in chat history only** (no floating bubble — owner rejected it): a per-scene `gossipLog` seeds the **T** global chat + each NPC records it in their own conversation so **E** with either shows it. Browser-only render, observers removed on unload. **Roadmap COMPLETE.**

> **Combat track — turn-based MELEE COMBAT phase COMPLETE & MERGED to `main` ([ADR-0019](docs/ADR/0019-turn-based-combat.md)). 934 tests, ~98%/90% coverage, typecheck+build green, owner-validated in Electron.** Consumes the F5 `attack` intent stub. **Model (owner-decided):** turn ≈ 1 s; **`AP = round(Destreza/10)`** (min Dex 20 = 2 AP = one primary action; Dex 60 = 6; 100 = 10); costs **primary 2 / secondary 1 / movement 1 AP/m**, no primary cap; **scalar distance in metres** (no grid), **melee needs ≤2 m**; **hit via power-ratio `SkillCheck`** (melee=Combate C-a-C/Força, ranged=Armas de Fogo/Destreza vs Percepção + cover +20/+40); attribute-scaled damage + variance; Destreza initiative; **1v1, only a hostile NPC triggers it**. **All tunable in Options** (`combatApPerDexterity`/`combatPrimaryCost`/`combatSecondaryCost`/`combatMoveApPerMeter`). **Trigger:** a hostile player emote toward an NPC (context-aware **`HOSTILE`** flag on the action classifier) worsens its disposition — 1st blow = ultimatum, 2nd = hostile → duel (`startCombat`). **Melee-only loadout now** (`CombatCapabilities`/`MELEE_ONLY_CAPS`): Shoot/Reload (no firearm until inventory) + Take cover/Hunker (no scenery cover) are **omitted from the menu** and the **NPC AI is forced to melee**; the engine still supports those actions for the future. **Pure, ~100%-covered core** `src/systems/combat/`: `CombatMath` (AP/move/hit/damage/initiative/tuning), `CombatEncounter` (state machine: AP refill, distance, cover, win/lose/flee, carries roll+probability+attackKind on attack events), `CombatAI` (`chooseCombatAction`, gated by firearm/cover caps), `CombatNarration.combatBeat`, `CombatController` (player→enemy turn orchestration, `playerActionOptions(caps)`, `objectiveLogLine`, `isCriticalHit`=natural d100<`CRITICAL_ROLL`(5)). **Browser-only (`istanbul ignore`d):** `CombatOverlay` (3D portrait strip top + right-side objective log + bottom action bar; chat closes on start) + `CombatPortraits` (per-combatant head-framing viewport camera in initiative order + neon turn marker; keeps the main camera as `activeCamera`/`cameraToUseForPointers` so GUI clicks work) + `GameWorldScene` wiring (cinematic combat camera framing the two; lunge-punch-retreat via `Animation` CONSTANT tween + `playCombatClip`; HitRecieve on hit / Death held on kill — embedded Quaternius `COMBAT_CLIPS`, no retarget; `NPCManager.narrateCombat` dramatizes ONLY a critical, one short poetic line) + `GameOverMenu` (on death: Load Last Save / Return to Main Menu; world frozen; autosave skipped so the dead state never clobbers the save). **Log:** right-edge column, only during combat — objective line per action leading with HIT/MISS + roll vs chance% + dmg (i18n), replaced by the poetic line on a critical. **Deferred:** **multi-combatant / faction fights** (allies & enemies join by NPC↔NPC disposition — owner's chosen NEXT combat step), **block/crouch animations** (need a rig retarget — cover/hunker have no pose, miss has no dodge), **weapons/ammo + inventory** (re-enables Shoot/Reload), **scenery cover** (re-enables Cover/Hunker), per-NPC stat blocks, mid-fight save, muzzle-flash particle, in-turn animation sequencing.

> **Items track — Fase 9 (Inventário + Itens) COMPLETE & MERGED to `main` (owner-validated in Electron). 1053 tests, ~98%/90% coverage, typecheck+build green.** Owner-locked scope: **melee weapons + consumables + loot/misc only — NO firearm/ammo this phase** (Shoot/Reload stay hidden; combat stays melee). **Pure data** (`src/entities/items/ItemCatalog.ts`): `ITEM_REGISTRY` (melee/consumable/misc; weight/stackable/maxStack; consumable `heal`) + `WEAPON_REGISTRY` (attackKind/skill/damageBase/variance/range; `attackKind` already models `ranged` for a future gun) + lookups (`itemDef`/`weaponDef`/`isWeapon`/`itemWeight`/`itemMaxStack`/`weaponProfile`), mirroring `CharacterStats.SKILLS`. **Pure value object** `src/entities/Inventory.ts`: weight-capped stacks (one entry/id, capped at `maxStack`), single `equippedWeaponId`, weight-respecting `add`/`addRespectingCapacity`/`transferTo` (corpse loot), serialize round-trip (100% covered). **Weapon-driven combat:** `CombatMath` gains `WeaponProfile` + `FIST_PROFILE` (bare fist == legacy melee constants exactly) + `rollWeaponDamage`; `CombatantInit.weapon` (default fist) drives hit damage + melee reach in `CombatEncounter`; `ItemCatalog.weaponProfile(weaponId)` resolves a profile (null/unknown/non-weapon → fist), one-way dep (`ItemCatalog → CombatMath`, no cycle); player armed from equipped weapon, NPC from its loadout. **Persistence:** `SaveGame.inventory` (+`migrate` backfills empty) carried by `GameSession`; **NPC inventory persisted in `npcMemory.inventory`** so a looted corpse stays looted across reloads (`NPCManager.restoreInventory`). **NPC loadout** (`NPCDefinition.loadout`) builds an `NPCAgent` inventory + auto-equips the first weapon (seeded: Mback=knife, Zara=pipe). **Empty starting inventory** (owner's call) — everything via loot. **UI** `src/systems/InventoryOverlay.ts` (PauseMenu pattern): pure state/actions (equip/unequip, use consumable → `onHeal`→`Health.heal`, drop, loot take/takeAll, row listings) fully tested; Babylon GUI browser-only/istanbul-ignored. **`KeyI`** → `'inventory.open'` opens manage mode (freezes world like pause; ESC/I closes); **searching a defeated NPC's corpse opens the overlay in loot mode** and transfers items (replaced the old "search the body" narration stub + removed the dead `chatMode:'corpse'` path). i18n EN/pt-BR for overlay + item names. **Playtest fixes (owner, Electron):** closing the loot overlay now restores the follow camera (`onClose`→`exitConversationMode`, since looting framed the corpse in conversation mode); the **combat log names the weapon** ("… HITS … with Knife" / "with fists") — the encounter carries the attacker's `weaponName` on hit/miss/death events → `CombatController`/`objectiveLogLine` → i18n. **Deferred:** firearms/ammo + Shoot/Reload, scenery cover, Zara shop/credit economy (credsticks inert loot), implants, item tiers. See [ADR-0021](docs/ADR/0021-inventory-items.md).

> **Objects & props track — Fase 10 COMPLETE & MERGED to `main` (with Fase 11; 1129 tests, ~98%/≥90% gated, typecheck+build green). See [ADR-0022](docs/ADR/0022-visual-objects-props.md).** Makes items **visual/physical** (Survival + Food CC0 packs). **Done:** **10.1** `ItemDef` gains `modelPath/equipSlot('main_hand'|'back')/capacityBonus/hungerRestore/attach{pos,rot,scale,bone}/holdClip` + lookups (`itemModelPath/itemEquipSlot/itemCapacityBonus/itemHungerRestore/isMeleeWeapon/isFirearm`); `Inventory` → **slot map** (`equipToSlot/unequipSlot/equippedIn`, `effectiveCapacity()` += backpack bonus); `equippedWeaponId`/`getCombatWeaponId` **derived** = main-hand item only if MELEE (flashlight arms, firearm=ranged→fists, combat stays melee). New items: axe/shovel, cosmetic firearms (pistol/revolver/shotgun), backpack(+20kg), flashlight(also weak melee), phone, 8 foods. **10.2** `src/entities/Hunger.ts` (pure: `tick(dt,hpFull)` converts hunger→HP 0.1%/s, holds at full HP, drains 0.01%/s starving; `feed/isLow`) + `SaveGame.playerHunger` + GameSession + migrate. **10.3** `scripts/convert_assets.py`→`public/assets/items/**` (~716 KB; per-item `attach.scale` from each GLB's **measured bbox** — pack meshes are large). **10.4** `src/systems/HeldItems.ts` — pure `heldPropsFor` + bone map (`Wrist.R` hand/`Chest` back) + save-override resolution (`resolveAttachWith/boneFor`); browser `HeldItemRig` bone-attaches GLBs (player + NPC). **10.4b Adjust tool** — `AttachAdjuster`(pure) + `AdjustOverlay`; **"Adjust" button per equipped row** (or `O`), camera wheel-zoom (`CameraSystem.setWheelZoomEnabled`)+Z/C; saves `{bone,pos,rot,scale}` **per-save in `SaveGame.heldAttach`**. **10.5** `COMBAT_CLIPS.slash='Sword_Slash'` + `attackClipFor` (armed melee→slash, fists→punch); weapon visible through the swing. **10.6** flashlight auto-lights a forward `SpotLight` parented to the hero + aim pose, doubles as melee. **10.7** firearm cosmetic: attach + aim pose (`holdsAimPose`), no shooting — **code done, awaiting Electron playtest**. **10.8** hunger tick + eat (Interact anim + food in hand via `HeldItemRig.showTransient`, destroyed on end) + diegetic `hunger.growl`. **Road rework:** the old flat black asphalt plane → the **zone ground plane IS the asphalt** (lit, seamless grey) + **emissive markings** (dashed centre line + 2 crosswalks) in `MercadoSombrasZone`; MegaKit `street_4lane` tile dropped (directional/flat-normalled → unreliable). **`DEBUG_TEST_LOADOUT` REMOVED** (the hero starts with an empty inventory; items come from loot). **Open:** 10.7 firearm validated (superseded by Fase 11 real firing); **10.9 phone+Claude lore chat = ON HOLD**; **10.10 drag-drop paper-doll = CANCELLED** (button inventory + Adjust button stay); **10.11 muzzle-flash** delivered live in Fase 11; 10.12 docs/green-gate done. Files: `src/entities/{items/ItemCatalog,Inventory,Hunger,PlayerController}.ts`, `src/systems/{HeldItems,AttachAdjuster,AdjustOverlay,InventoryOverlay,CameraSystem}.ts`, `src/assets/AvatarMeshCatalog.ts`, `src/entities/zones/MercadoSombrasZone.ts`, `src/assets/WorldAssetCatalog.ts`, `src/scenes/GameWorldScene.ts`.

> **Combat actions track — Fase 11 COMPLETE & MERGED to `main` (owner-validated in Electron: equip pistol → ribbon Shoot → click NPC fires + ambush combat starts; 1129 tests, ~98%/≥90% gated, typecheck+build green). See [ADR-0023](docs/ADR/0023-action-ribbon-surprise-attack-ranged.md).** Adds a **main action ribbon** + **out-of-combat surprise attack** + **real ranged firing** (the muzzle-flash gatilho). **11.1** combat now reads the **main-hand weapon (melee OR firearm)** — `Inventory.combatWeaponId` (any weapon) drives the `WeaponProfile`; the player's `CombatCapabilities.firearm` is derived from `isFirearm(mainHand)` (replaced the fixed `MELEE_ONLY_CAPS`); `CombatEncounter.weaponOf` + `CombatController.aiActionFor` make each NPC choose ranged vs melee by its **own** weapon (a knife ally melees even when the player has a gun). **Revokes "firearm cosmetic-only"; ammo/Reload still deferred.** **11.2** `targetRangeFor(kind, weapon)` — ranged reaches `weapon.range` (pistol 20/revolver 22/shotgun 12 m), melee gated at `MELEE_RANGE` (no pistol-whip-at-range); the in-combat ring uses it. **11.3** `CombatEncounter` `ambusherId` = takes the first turn regardless of Dexterity; `beginCombat(opts{ambush,openingAttack})` auto-applies the opening strike/shot (the player keeps the rest of the turn). **11.4** `src/systems/SurpriseTargeting.ts` (pure `withinRange`/`nearestToPoint`) + browser aiming: click an attack → ring the NPC under the cursor (green within reach) → click = `beginCombat(ambush)`; a scene `onPointerObservable` commits, ESC cancels. **11.5** `src/systems/ParticleEffects.ts` (`muzzleFlashConfig` pure + `createMuzzleFlash` browser burst) fired from `animateCombatBeat` on a ranged beat (player + NPC) — replaces the deferred 10.11. **11.6** `src/systems/ActionRibbon.ts` (pure `ribbonButtons`/`press` + GUI bar): **Atacar Ranged** (gated by firearm) · **Atacar Melee** · **Falar** (opens chat) · **Inventário**; `syncActionRibbon` hides it during combat/dialog/overlay/aim/vehicle. **11.7** bottom bands no longer overlap (hint −12 · ribbon −44 · prompt −92); `WorldHud.setHudTextVisible(false)` hides hint+prompt in combat; `hud.controls` updated to real bindings (EN/pt-BR). **`DEBUG_TEST_LOADOUT` removed** (empty starting inventory). **Playtest fix (Lesson 32):** the surprise commit click is a **canvas DOM `pointerdown`** (the Babylon pointer observable was swallowed by the camera input). Open: ammo+Reload, scenery cover, line-of-sight, per-NPC stats.

Next (unstarted, owner's call — **to be replanned**): a **2nd street** via the +X exit wall (scene transition); **ammo + Reload** (ranged firing now works, but no ammo economy); **per-NPC stat blocks**; real Claude tokens (`--output-format json`); more NPCs/routines; scenery cover; implants; Zara shop/economy. (Combat multi-combatente entregue na Fase 8; inventário + loot de cadáver na Fase 9; ribbon + ataque-surpresa + ranged na Fase 11.)

### Chat / NPC (this is the marquee feature — works end-to-end)
- **Cinematic chat** (`DialogSystem`): scrollable transcript seeded with prior history; `*emotes*` vs `"speech"` parsed + styled **per speaker** (player can roleplay actions or mix with dialogue); grid layout (SEND never clipped).
- **Native DOM `<input>`** (not Babylon GUI InputText) so non-US layouts / accents (ç ã é) / `?` / IME / paste work; `keydown` stopPropagation keeps typing out of the game input.
- **Pre-moderation** (`ClaudeNPCService.moderate` + `PromptBuilder.buildModerationPrompt`): a one-word ALLOW/BLOCK classifier screens the player's message BEFORE it reaches the NPC; blocked input shows a `system` line "You can't say or do that" and is never sent. Fails OPEN on CLI error. (With this gate, the earlier in-prompt violent/sexual guardrails + reply sanitizer were reverted as redundant.)
- **Windows Claude CLI launch** (`electron/main.ts` `resolveClaudeInvocation`): runs the package entry (`cli.js` via Electron-as-Node, or native `bin/claude.exe`) by reading the npm shim — no Node-on-PATH dependency. Keep Options→Claude CLI path **blank** to auto-detect.

### Health & damage (player + vehicle)
- [`src/entities/Health.ts`](src/entities/Health.ts) — pure HP value object (`applyDamage`/`heal`/`fraction`/`isDead`/`isCritical`/`toState`), shared by player and bike.
- **Player gravity + fall damage:** dismounting in mid-air drops the hero (`PlayerController.startFalling`); landing above `safeFallSpeed` costs HP scaled by impact speed. HP **0 → game over → Main Menu** (`GameWorldScene.checkGameOver`).
- **Bike crash model:** an *unpiloted* bike has its engine off, so it free-falls (no vertical drag) and crashes; impact above `safeImpactSpeed` damages it. Critical HP (≤30%) → smoke particles; **0 HP → explode** (destroyed = unmountable wreck).
- **Persisted:** `SaveGame.playerHealth` + `SaveGame.vehicle {health,destroyed}` (with `SaveService.migrate` backfilling legacy saves); carried across scenes by `GameSession`.
- HUD shows a hero HP bar (green→amber→red) + a `NAVE n%` / `NAVE DESTROYED` status (`WorldHud`).

### Controls (in game world)
- **WASD** — move, **relative to the camera** (W = where the camera faces). Hold **Shift** to sprint.
- **Z / C (hold)** — orbit the camera left / right 360° around the hero (`KEY_ORBIT_SPEED`, continuous). **Middle-mouse drag** also orbits (`ORBIT_SENSITIVITY`) but its native-canvas wiring is browser-only/untested — Z/C is the reliable, tested path. Q/E/R do not rotate.
- **E** — talk to a nearby NPC (opens chat; type `"speech"` and/or `*actions*`). **F** — enter/exit the flying bike. **Space/Ctrl** — bike altitude up/down.
- **ESC** — pause menu (Resume / Save Game / Load Game / Quit to Main Menu). While a dialog is open, ESC closes the dialog instead.
- On-screen: floating name labels over NPC/vehicle + a contextual `[E]/[F]` prompt + a persistent control hint (`WorldHud`).

| Phase | What | State |
|---|---|---|
| 0 | Docs + scaffolding | ✅ |
| 1 | Scene flow + fade transitions | ✅ |
| 2 | Splash/Studio/Publisher + Main Menu (neon, procedural cityscape) | ✅ |
| 3 | Options (4 tabs + persistence) | ✅ |
| 4 | Character Creator (modular, 360° preview) | ✅ |
| 5 | Save/Load/Delete | ✅ |
| 6 | World: zone system + isometric camera | ✅ |
| 7 | Player controller + Havok physics + input | ✅ |
| 8 | **NPC + Claude CLI (Zara) — MVP** | ✅ |
| 9 | Vehicles — atmospheric **nave** MVP (lift/drag flight, F to mount, vehicle camera) | 🟡 MVP (car + ambient traffic deferred) |
| #4 | **Real world assets — downtown V1** (Quaternius CC0; closed street, doors, Zara avatar, nave) + **Havok collision** ([ADR-0015](docs/ADR/0015-downtown-assets-and-havok-collision.md)) | ✅ |
| 10 | **Turn-based MELEE combat — COMPLETE** (AP from Destreza, power-ratio hit, scalar distance, hostile-NPC trigger, 3D portraits + turn marker, lunge/hit/death anims, right-side log, Game Over menu, melee-only loadout; [ADR-0019](docs/ADR/0019-turn-based-combat.md)) | ✅ |
| 8 (tactical) | **Tactical combat — COMPLETE & MERGED** (spatial Move/AP routed around obstacles + on-ground trail; melee ≤1 m; flee >10 m; **multi-combatant by relationship ledger, no factions** — recruited sides, allies AI-fight, player-flee-continues, friendly-fire defection, autonomous/spectator NPC↔NPC fights; self-following NPC capsule + centralized locomotion; survivors learn who died; [ADR-0020](docs/ADR/0020-tactical-multicombatant-combat.md)) | ✅ |
| 9 (items) | **Inventory + items — COMPLETE** (weight-capped inventory; melee weapons drive combat damage/reach via `WeaponProfile`/`FIST_PROFILE`; consumables/medkit→heal; loot/misc; NPC `loadout` → combat weapon + lootable corpse; `KeyI` overlay + corpse loot mode; persisted in `SaveGame.inventory` + `npcMemory.inventory`; firearm/ammo deferred; [ADR-0021](docs/ADR/0021-inventory-items.md)) | ✅ |
| 10 (objects/props) | **Visual objects & props — COMPLETE & MERGED**: held-item bone attach (`HeldItems`) + in-game **Adjust** tool (persists `{bone,pos,rot,scale}` in `SaveGame.heldAttach`); paper-doll slots (hand/back, backpack +capacity); **Hunger** (HP regen/drain) + eating anim; flashlight (auto light+aim+melee); cosmetic firearm (attach+aim) — superseded by Fase 11 real firing; lit-ground road + emissive markings. **10.9 phone ON HOLD, 10.10 drag-drop CANCELLED**. [ADR-0022](docs/ADR/0022-visual-objects-props.md) | ✅ |
| 11 (ribbon/ranged) | **Action ribbon + surprise attack + real ranged combat — COMPLETE & MERGED** (owner-validated): `ActionRibbon` (Attack Ranged/Melee · Talk · Inventory; ranged gated by firearm); out-of-combat **surprise attack** (click→aim→click = ambush, player gets the first turn); **real firing** (`Inventory.combatWeaponId` melee OR firearm; caps from equipped gun; per-NPC ranged AI; range = weapon range); live muzzle-flash; combat HUD re-centered + key hints updated. Ammo/Reload still deferred. [ADR-0023](docs/ADR/0023-action-ribbon-surprise-attack-ranged.md) | ✅ |
| 12+ | Implants, world expansion (next scene via the +X exit wall), **ammo + Reload**, scenery cover, per-NPC stat blocks, Zara shop/economy | ⬜ |

**Verified working in Electron:** full flow splash → … → game world; player moves (camera-relative), camera orbits (Z/C), **Zara holds a live Claude conversation** (after fixing the Windows CLI launch + clearing a bad Options path), emotes/accents type correctly, pre-moderation blocks out-of-policy input.

**INTEGRATION GAPS:**
1. ✅ **Dialog GUI** — DONE. `DialogSystem` now renders a bottom speech bubble (NPC name + wrapped streaming text + `. . .` thinking placeholder), a player `InputText` with a SEND button and Enter-to-submit, and tracks input focus (`isInputFocused()`). Browser-only render/build is `istanbul ignore`d; pure state machine + focus flag stay fully tested. While the dialog is open, `GameWorldScene.update` freezes player movement/camera so typing doesn't move the character, and the interact key won't close the dialog while the field is focused.
2. ✅ **GameSession glue** — DONE. New `src/core/GameSession.ts` holder (`{saveId, character, npcMemory, world, gameTimeSeconds}`) registered in ServiceLocator under `'gameSession'`. `CharacterCreatorScene.onBegin` creates+persists a save (`SaveService.createNewSave`+`save`) and registers a session; `LoadGameScene.onLoadSave` builds a session via `GameSession.fromSave`. `GameWorldScene.onEnter` adopts appearance/name/npcMemory and spawns at the saved world position (falls back to the zone spawn point when position is all-zero).
3. ✅ **Autosave (on scene exit)** — DONE. `GameWorldScene.onExit` calls `persistSession()` → `SaveService.updateWorldState` + `updateNpcMemory` (and updates the in-memory session). NOTE: this persists on *exit only*; a periodic/interval autosave during play is still future work.
4. ✅ **Real assets** — DONE (downtown V1, see Status + [ADR-0015](docs/ADR/0015-downtown-assets-and-havok-collision.md)). The user supplies Quaternius CC0 packs (Downtown City MegaKit + Ultimate) in `~/Downloads`; the agent converts them with `scripts/convert_assets.py` (`blender --background`, FBX/glTF→GLB, `--maxtex` downscale, force-opaque) into `public/assets/world/**` + `vehicles/nave.glb`, then places them via the pure `WorldAssetCatalog`. `MercadoSombrasZone.loadRealAssets` loads each GLB into a `TransformNode` holder, hides the procedural market, and builds Havok colliders. (The old "agent can't fetch binaries" constraint is sidestepped: Blender runs locally on user-provided source files.) Follow-ups: the +X **exit wall → second street** transition; per-prop instancing to cut texture duplication.

---

## Hard-Won Lessons (READ before debugging the running app)

These cost real debugging time — internalize them:

1. **No runtime `require()` in `src/`.** The renderer is ESM-bundled by Vite; `require` is undefined → ReferenceError → black screen. Always use static `import` at file top, even for browser-only modules (`@babylonjs/gui`, `uuid`). The `typeof document` guards keep canvas-creating calls out of Jest; merely *importing* `@babylonjs/gui` is safe in Jest.
2. **Never `await sceneManager.loadScene(next)` from inside a scene's `onEnter`.** The SceneManager is still `transitioning` from loading THAT scene, so the nested call hits the guard and silently no-ops → stuck screen. Schedule the next scene with a fire-and-forget `setTimeout` (cleared in `onExit`). See SplashScene/StudioScene/PublisherScene.
3. **Create the camera FIRST in any scene's `onEnter`,** before any slow `await` (Havok WASM, asset loads). No active camera → `Scene.render()` throws "No camera defined" every frame → black screen. Keep slow/failable init (physics) LAST and in `try/catch`.
4. **Babylon GUI alignment uses named constants, not magic numbers.** `Control.VERTICAL_ALIGNMENT_CENTER` ≠ 1 (1 is BOTTOM). Import `Control` and use the constants.
5. **`tsconfig.jest.json` is laxer than the build configs.** Jest passing ≠ typecheck passing. ALWAYS run `npm run typecheck` (checks renderer + electron + node) before committing.
6. **One Electron instance.** `vite-plugin-electron` auto-launches Electron via `onstart`; do NOT also launch it with concurrently. `npm run dev` is the single dev command.
7. **Browser-only code pattern:** guard with `if (typeof document === 'undefined') return;` + `/* istanbul ignore next */` on the browser branch, keep pure logic separate and 100% tested. This is how every system stays at coverage target without a GPU/DOM.
8. **Don't set a `layerMask` on a fullscreen GUI layer.** `AdvancedDynamicTexture.CreateFullscreenUI(...).layer.layerMask = 0x10000000` is OUTSIDE the camera's default mask `0x0FFFFFFF` → the GUI silently never renders (invisible dialog). Leave the default mask. Tests can't catch this (NullEngine renders nothing) — it only shows in Electron.
9. **Camera-relative WASD needs a +90° yaw offset.** `ArcRotateCamera.alpha` is the orbit angle of the camera *position*; the direction it *looks* is `alpha + π/2`. `CameraSystem.getYaw()` returns that offset so `PlayerController/VehicleController.computeDisplacement` point W where the camera faces. Unit tests pass with raw `alpha` because they assert with self-consistent yaw values, but the real camera default (`alpha = -π/2`) made W move sideways until the offset was added.
10. **Babylon GUI controls are drawn on the canvas, not the DOM.** DOM-based automation (Preview MCP `preview_click`, querySelector) can't click `Button`/`InputText` — they have no DOM nodes. Driving the UI for screenshots requires canvas-coordinate clicks or programmatic scene calls. Plan manual verification accordingly.
11. **Linear drag caps terminal velocity — watch it vs. damage thresholds.** With `v *= (1 - drag·dt)` the terminal fall speed is ≈ `gravity/drag` (~4.9 at drag 2). If that's below your crash-damage threshold, falls *never* deal damage. Fix: don't apply drag to the vertical axis during free-fall (engine-off bike free-falls; player fall uses no drag at all). Always sanity-check terminal speed against any speed-gated effect.
12. **NullEngine `getDeltaTime()` is ~0 in tests.** Movement/physics that integrate `dt` won't progress; assert `>=` or `jest.spyOn(engine,'getDeltaTime').mockReturnValue(100)` when a test needs real motion.
13. **Spawning the `claude` CLI from Electron on Windows: run the package entry with Electron-as-Node.** The npm `claude.cmd` shim calls `node <entry>`, but the Electron child often lacks Node on its PATH → `"...is not recognized"` (exit 1). The package entry may be `cli.js` OR a native `bin/claude.exe` (newer versions). `electron/main.ts` `resolveClaudeInvocation()` finds the shim via a synchronous PATH `whichSync('claude')`, **reads the `.cmd` shim** (`readShimEntry`) to get the true entry, and runs it: `.js` via `process.execPath`+`ELECTRON_RUN_AS_NODE=1`, `.exe` directly. Always capture+surface the child's stderr (a verbose diagnostic log `[Claude NPC] claudePath=… command=… mode=…` was decisive). Two gotchas that cost rounds: a **malformed Options path** (`…cli.jsclaude` from a bad paste) → keep Options→Claude path **blank** to auto-detect; and a **broken global install** (`bin/claude.exe` missing) fails even in a plain terminal — that's `npm i -g @anthropic-ai/claude-code`, not the game.
14. **NPC names are hidden until introduced (anti-metagaming).** `NPCAgent.getDisplayName()` returns `'Unknown'` until `revealNameIfMentioned(reply)` matches the NPC's name in its own dialogue; only then do the floating label, dialog header, and `[E] Talk` prompt show the real name. (Currently runtime-only — resets on reload; persisting the discovery flag is a follow-up.)
15. **Babylon GUI `InputText` mangles non-US keyboards.** It reconstructs text from key events, so ABNT2 `?`, accents (ç ã é), dead keys, IME and paste break. Use a **native DOM `<input>`** overlaid on the canvas (`DialogSystem.buildDomInput`), `stopPropagation` its keydown so typing doesn't drive the game, and read its `.value` on submit. Canvas-drawn GUI is fine for display, not for text entry.
16. **NPC content safety = pre-moderation gate, not prompt-only.** Screen the player's message with a one-word ALLOW/BLOCK classifier call BEFORE sending to the NPC (`ClaudeNPCService.moderate`); block out-of-policy input up front with a `system` line. Fail OPEN on CLI error so play never hard-stops. This made the per-turn in-character "deflect sexual/violent" prompt guardrails + reply sanitizer redundant — they were removed. The model's own refusal of *explicit* generation is a safety line the prompt can't (and shouldn't) override.
17. **MakeHuman/MPFB2 exports carry no fine facial shape keys, and `Apply Modifiers` strips the macro ones.** MPFB applies its detail morphs (nose/ears/lips…) to vertices, not as glTF morph targets — a clean export has **0** fine shape keys (verify with the `[Avatar] GLB morph targets (N)` log). The basemesh's helper "robe" is hidden by a Mask modifier; you must enable glTF **Apply Modifiers** to drop it, but applying a vertex-count-changing modifier **deletes all shape keys** — so you can't keep macro morphs *and* a clean mesh. Conclusion: don't build in-game facial morph sliders on a MakeHuman base. Do customization by **swapping whole GLBs** instead (one per ethnicity: `body_<gender>_<african|asian|caucasian|universal>`), tint skin via material `albedoColor`, and reserve runtime morphs for a future shape-key-bearing base. Also: register `@babylonjs/loaders/glTF` or `SceneLoader` can't read `.glb`; Babylon GUI `verticalAlignment = 2` is CENTER not bottom (Lesson 4 again). **(The "rotate `__root__` 180°" that was here is base-dependent — see Lesson 18.)**

18. **Rig + animate the hero via Mixamo, and mind the facing.** Several traps, learned end-to-end: **(a) Mixamo won't accept GLB** — only FBX/OBJ/ZIP. Export the body from Blender as FBX, auto-rig in Mixamo, re-download the rigged character **With Skin** as the new base GLB. **(b) Bone-name parity is everything** — get base AND clips from Mixamo so all bones are `mixamorig:*`; then retargeting separate clips is a pure name match (`diffSkeletonBones` reports mismatches). **(c) Mixamo names every clip `Armature|mixamo.com|Layer0`** — `loadAnimationClips` clones each `AnimationGroup` onto the base skeleton and **renames it to the manifest key** (`idle/walk/run/interact`) so `PlayerController`'s name-based playback works. Separate clips are loaded "Without Skin" (walk/run **In Place**, 30fps) and **take precedence** over any embedded in the base. **(d) Facing is base-dependent: Mixamo faces +Z, MPFB faced away.** +Z IS our world forward at `rotation.y=0`, so with `root.rotation.y = facing` you must **NOT** rotate the model — keeping the old 180° flip makes the hero "moonwalk" (body 180° from travel). The flip was removed in `assembleGltf`; the creator camera moved to `alpha=+π/2` to still face the model's front. **(e)** Convert the Mixamo FBX→GLB headless with `scripts/convert_anims.py` (`blender --background --python`). Verify with the `[Avatar] loaded anim clip "…"` / `…bones absent from the base rig` console logs.

19. **Havok WASM in Vite/Electron: copy it to `/public`, don't deep-import.** `HavokPhysics()` with no `locateFile` resolves the wrong URL → the request falls through to `index.html` → `Incorrect response MIME type` / `WebAssembly … found 3c 21 44 4f` (`<!DO`). The package's `exports` map **forbids** a deep `?url` import (`Missing "./lib/esm/HavokPhysics.wasm" specifier`), so a `scripts/copy-havok-wasm.mjs` copies it into `public/` (hooked via `predev`/`prebuild`/`preelectron:dev`; the copy is gitignored) and `PhysicsService` passes `locateFile: () => '/HavokPhysics.wasm'`. Watch for `[Physics] Havok enabled`. **Enabling physics does NOT add collision by itself** — you still need colliders + a physics-driven mover (Lesson 20).

20. **Collision = `PhysicsCharacterController` (hero) + static `PhysicsAggregate` boxes (world).** Movement was kinematic (`root.position +=`), so nothing collided even with Havok on. Fix: when `scene.isPhysicsEnabled()`, `PlayerController` drives a `PhysicsCharacterController` (capsule; `checkSupport → setVelocity → integrate(dt, support, gravity) → root.position = cc.getPosition()`, with a `capsuleHalf` feet-offset) and the kinematic path stays for headless tests. World solidity = one invisible **box** `PhysicsAggregate` (`mass:0`) per perimeter wall + per *solid* prop (derive size from `holder.getHierarchyBoundingVectors`); **roads/sidewalks/food stay walkable** (no collider) and a **floor box** gives the controller ground. Init physics **before** the zone+player so colliders/controller exist. Pure collider boxes (`CORRIDOR_COLLIDERS`) live in the catalog; all Havok code is `isPhysicsEnabled()`-guarded + `istanbul ignore`d.

21. **Placing a separate prop into a model's hole needs the hole's real offset — measure it.** Aligning MegaKit doors into building openings by eye/guess oscillated for many rounds. The fix: parse the building GLB and read the **interior-floor mesh X-centre** per model (large was off-centre at +1, others centred) — that's where the opening is. Also: the door GLB's leaf is hinged off-centre (pivot at local x=0, leaf to −1 → half-leaf `DOOR_PIVOT`), and the building's placement rotation (π on the north side) **flips local X**, so the world offset sign depends on the side. Lesson: don't eyeball repeated nudges — measure the target submesh, and account for both the prop's pivot and the parent rotation. (FBX→GLB also imports base-colour **alpha as 0** → fully transparent; `convert_assets.py` forces materials opaque. MegaKit `?url` textures are 2K and embed per-GLB → use `--maxtex 512` to avoid ~290MB of duplicated atlases.)

22. **cRPG checks: a single d100 has too much variance — use a power-ratio.** `roll×value` let a weak character beat a strong one too often. The model is now `P = atk^k / (atk^k + def^k)` (**k=2**, configurable) then **one d100; success if < P×100** (`src/systems/SkillCheck.ts`). The stat gap dominates, luck only decides close calls, and nothing is ever a hard 0/100%. `atk`=skill% if the action fits one else the governing attribute% (`CharacterStats.checkValue`); `def`=opponent value (contested, **one** roll vs P(actor)) or a fixed difficulty (unresisted, default 50). Buffs/debuffs/cover are **±N on each side's effective value** (cover +20/+40), floored so they never lock 0/100%. RNG is injected for tests. See ADR-0016.

23. **i18n: cache the locale, but `resetLocale()` in test teardown.** `I18n.t(key)` reads the locale lazily from `SettingsService.language` and **caches** it in a module var for speed. Jest isolates modules per test FILE, so the cache is fresh per file — but **within** a file any test that calls `setLocale`/`cycleLanguage` must `resetLocale()` (and `SettingsService.reset()`) in `afterEach`, or later tests see the wrong language and English assertions fail. NPC replies follow the language via `WorldSnapshot.language` (`Respond in {language}`); the moderation/action **classifiers stay English** (they emit labels, not player-facing text). See ADR-0017.

24. **Babylon GUI `InputText` is unusable for typing — use a native DOM `<input>` (Lesson 15 again).** This bit BOTH the dialog AND the character-creator name field: the name field silently took no input. The fix is the same overlay pattern (`document.createElement('input')`, fixed-position over the canvas, `stopPropagation` on keydown so typing doesn't drive the game, read `.value` on submit/BEGIN, remove the wrapper on scene exit). If you add any text-entry field, reach for the DOM input from the start. (Also: the creator preview was T-posing because it assembled the avatar but never started a clip — `start` the looping **idle** AnimationGroup after each rebuild.)

25. **A *moving* entity needs a collider that FOLLOWS it — not a separate static box you reposition.** NPCs were first given a static `PhysicsAggregate` box (mass 0) sized from the bounding box (treated like a prop, Lesson 20). But a static Havok body does NOT track its mesh, so a repositioned NPC (combat reposition, gossip walk) left the box behind — an invisible wall at the old spot, and the NPC pass-through at the new one. Rebuilding the box on each move worked but was clumsy. The clean fix is the entity's **own collision mold**: a **capsule parented to the holder** (same shape the hero's `PhysicsCharacterController` uses), an **`ANIMATED` motion-type body with `disablePreStep = false`** so Havok reads the holder transform every step and the collider follows automatically — no rebuild plumbing. Use this for anything code-moved (NPCs); reserve static boxes for things that never move (walls, parked nave).

26. **Centralize entity locomotion behind one set of primitives — don't let it fork per feature.** NPC movement had drifted into two parallel implementations (a per-frame gossip mover `stepNpcMovers` and a combat `walkAlongPath` tween), plus scattered `holder.position` / `holder.rotation` / `agent.setPosition` writes, so every new mover risked forgetting to sync the logical agent position (which drives `[E]`/proximity/camera) or the collider. Fix: one `moveNpcTo` (moves holder + logical agent together; the parented capsule follows), `faceNpc`/`faceNpcToward`, and one `startNpcWalk`/`stepNpcWalks`/`finishNpcWalk` polyline walker — shared by gossip AND combat (player included, via `combatNode`). When you find two code paths doing "the same kind of move," collapse them to a primitive before adding a third.

27. **An AnimationGroup (idle) re-evaluates its targets every frame — a one-shot transform pin won't hold against it.** A combatant kept snapping back to its modelled forward at the end of a move: setting `holder.rotation.y` once in the walk-completion callback was immediately overwritten because the looping idle clip re-asserts the avatar's authored pose each frame. Fix: keep the desired facing in a small map (`combatFacing`) and **re-assert it every frame** (`pinCombatFacings`), skipping anything mid-walk. The general rule: to hold a transform against a running animation, re-apply it on the render loop, don't set-and-forget.

28. **The NPC prompt already had a `recentEvents` channel — wire memory into existing seams instead of inventing new ones.** Making a surviving NPC "know who died" needed no prompt redesign: `PromptBuilder` already emitted "Recent events you witnessed: …", it was just always fed `[]`. Added a persisted `NPCAgent` events memory (`rememberEvent`/`getRecentEvents`, deduped+capped) populated on combat end and surfaced via `buildWorldSnapshot`. Before adding a new prompt field, check what the builder already supports.

29. **A modal that re-frames the camera must restore it on close — and weapon/label flavour rides on the EVENT, not a render-time lookup.** Two Fase-9 playtest bugs, same shape: (a) opening the corpse-loot overlay called `enterConversationMode(holder)` to frame the body, but closing it left the camera stuck — the fix is a symmetric `onClose` → `cameraSystem.exitConversationMode()` (harmless even when the overlay was opened in manage mode, where no reframing happened). Any overlay/dialog that moves the camera on open MUST undo it on close. (b) The combat log couldn't say "with Knife" because the weapon lived only on the inventory at the moment of the strike — the durable fix is to stamp the attacker's `weaponName` onto the attack **event** in `CombatEncounter`, so `CombatController`/`objectiveLogLine`/i18n carry it through without re-deriving state later. Push display facts onto the event when it happens; don't reconstruct them downstream.

30. **A flat zero-thickness plane often renders BLACK (downward/missing normals); and Babylon silently drops the 5th+ light per material.** Two Fase-10 world-lighting traps: (a) the imported `street_asphalt_9x9` road was a flat plane (ext height 0) that came in unlit/black and blew out under the flashlight — fixed by making the street a `CreateGround` (faces up → lit) or a thick slab; avoid flat decals for lit surfaces, and for road *markings* use **emissive** tiles (ignore lighting/normals entirely). (b) A held flashlight is the 5th+ light alongside the street neons, and Babylon's per-material `maxSimultaneousLights` defaults to **4**, so it was dropped on most surfaces — raise it on every material **including async-loaded ones** via `scene.onNewMaterialAddedObservable`. Also: derive a held prop's scale from its GLB's **measured bounding box** (pack meshes are authored large), and never trust a non-uniform-scale + rotation combo on an imported tile (it broke the tile's normals → black) — prefer uniform scale.

31. **Calibrate-in-engine beats guess-and-screenshot: build a tiny in-game tuning tool whose output persists.** Held-item attach offsets (pos/rot/scale/bone) are impossible to eyeball; instead of round-tripping screenshots, the **Adjust tool** (`AttachAdjuster` pure + `AdjustOverlay`, opened from an inventory "Adjust" button) lets the owner nudge the live prop with camera wheel-zoom/orbit and saves `{bone,pos,rot,scale}` per-save in `SaveGame.heldAttach` (merged over the catalog default by `resolveAttachWith`/`boneFor`). When a value can only be judged visually, give the human a knob + persistence rather than iterating blind.

32. **For a world click outside a GUI scrim, listen on the CANVAS DOM (`pointerdown`), not `scene.onPointerObservable`.** The Phase-11 out-of-combat surprise attack drew its green/red target ring fine (the preview reads `scene.pointerX/Y` every frame in `update()`), but **clicking never committed** — `scene.onPointerObservable` `POINTERTAP`/`POINTERDOWN` simply wasn't delivering the event here (the ArcRotateCamera input pipeline swallowed it). The in-combat targeting doesn't hit this because it commits through the CombatOverlay's full-screen GUI **scrim** `onPointerUpObservable`. With no scrim on foot, the reliable signal is a direct `engine.getRenderingCanvas().addEventListener('pointerdown', …)` (filter `e.button === 0`; remove it in `onExit`). Diagnosis tip: if `pointerX/Y` updates (ring follows the cursor) but no click handler fires, the input manager is alive — it's the *observable delivery* that's failing; drop to the DOM event. (Confirmed by a one-shot `console.warn` in the commit fn — clicking logged the resolved `{cand,dist,reach}` only after switching to the DOM listener.)

### cRPG / combat model quick-reference (so a fresh context doesn't re-derive it)
- **AP** = `round(Destreza/10)` (clamped 0..`apMax`). Costs: primary (attack) 2, secondary (cover/hunker/reload) 1, **movement `moveApPerMeter` per metre** (default **0.5** → 1 AP moves 2 m). All tunable in Options.
- **To-hit** = power-ratio `SkillCheck` (k=2): `P = atk²/(atk²+def²)`, one d100 < P·100. Melee=Combate C-a-C/Força, ranged=Armas de Fogo/Destreza, defence=Percepção; cover +20/+40 on the defender.
- **Damage** = `rollWeaponDamage(stats, profile)` = `profile.damageBase + (melee:Força/10 | ranged:Destreza/20) + d(0..variance-1)`. **`FIST_PROFILE`** (base 8, var 5, range 1) == the pre-Phase-9 constants exactly; weapons come from `WEAPON_REGISTRY` via `ItemCatalog.weaponProfile(id)`.
- **Melee reach** = the weapon's `range` (fist 1 m). **Flee** only when nearest foe > `FLEE_MIN_DISTANCE` (10 m). Initiative by Destreza desc, ties by id.
- **Sides** (8B): a foe is anyone on a different `side`; `CombatRecruiter.recruitSides` assigns sides whole-scene by the NPC→NPC ledger (hostile/wary→oppose, friendly→defend, neutral/tie→out). Player flee → fight continues (`resolved`).

---

## Project Overview

Single-player cyberpunk isometric open-world RPG for PC. Standout feature: every NPC is powered by a live `claude` CLI subprocess, enabling natural conversation and reactive behavior. Developed entirely by vibe coding with Claude.

**Vision:** Satellite Reign × Space Haven × Cyberpunk 2077  
**Studio/Publisher:** BeiraRio Games  
**Target Platform:** Windows PC (Electron wrapper)

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| 3D Engine | Babylon.js | ^7.35.0 |
| Language | TypeScript | ^5.7.2 |
| Desktop | Electron | ^33.2.0 |
| Bundler | Vite + vite-plugin-electron | ^6.0.2 |
| Tests | Jest + ts-jest | ^29.7.0 |
| Coverage | Istanbul (built-in Jest) | 95% threshold |
| NPC AI | `claude` CLI subprocess | system-installed |

---

## Commands

```bash
npm run dev          # Vite dev server (browser preview)
npm run electron:dev # Electron + Vite dev (full game)
npm run build        # Production build
npm run electron:build # Build + package installer
npm test             # Run all tests
npm run test:watch   # Tests in watch mode
npm run coverage     # Tests + coverage report (must be ≥95%)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

---

## Directory Structure

```
electron/           IPC bridge, Claude CLI subprocess, window controls
  main.ts           Electron main process (Node.js); resolveClaudeInvocation() finds+launches the claude entry robustly (see Lesson 13); streams stdout, surfaces stderr
  preload.ts        contextBridge API exposed to renderer

src/
  main.ts           Renderer entry point — initializes GameManager
  vite-env.d.ts     Vite types + global Window.electronAPI (single source)
  core/             Engine infrastructure
    GameManager.ts  Singleton: owns Engine, SceneManager, ServiceLocator init
    SceneManager.ts Load/unload scenes, scene registry, fade transitions
    FadeController.ts Pure alpha animation (injectable applyAlpha callback)
    ServiceLocator.ts Lightweight DI container
    EventBus.ts     Typed pub/sub (GameEvents interface)
  scenes/           One file per Babylon.js Scene
    BaseScene.ts    Abstract base: onEnter(), onExit(), update(), dispose()
    SplashScene/StudioScene/PublisherScene  Branding sequence (timer-driven)
    MainMenuScene.ts  Procedural cityscape + New Game / Load / Options / Quit
    CharacterCreatorScene.ts  360° preview, body/hair/skin/clothes/implants
    LoadGameScene.ts  Save list, load, delete
    OptionsScene.ts   Tabs: Game / Display / Video / Audio
    GameWorldScene.ts Wires camera+input+zone+player+vehicle+NPC+dialog+pause+HUD (camera FIRST); ESC pause freezes world
  entities/         Game objects (data + behavior, no GUI)
    CharacterData.ts      Appearance model (slots/morphs/colors/skinTexture) + SLOT/MORPH registries + pure rules (applySlot/resolveLayers/clampMorph) + migrateAppearance
    WorldZone.ts          Abstract zone (load/unload/spawn/bounds)
    zones/MercadoSombrasZone.ts  Starting district (procedural)
    PlayerController.ts   Pure computeDisplacement + spawn + movement + gravity/fall damage + Health + locomotion anim state
    Locomotion.ts         Pure selectLocoState (idle/walk/run/interact) for animation playback
    VehicleController.ts  Pure computeFlightStep (lift/drag) + mount/pilot/park + fall/crash/smoke/explode + Health (Phase 9 MVP)
    Health.ts             Pure HP value object (damage/heal/fraction/isDead/isCritical) for player + vehicle
    NPCAgent.ts           Persona + state machine + proximity (pure)
    npcs/zara.ts          Zara definition (first NPC)
  systems/          Game systems
    InputSystem.ts        Keyboard → action map + movement axis (pure core)
    CameraSystem.ts       Isometric ArcRotateCamera, follow, MMB-drag 360° orbit, getYaw (+90° offset), vehicle mode
    PhysicsService.ts     Havok WASM init (browser-only, guarded)
    SettingsService.ts    Settings load/save/validate (localStorage + memory)
    SaveService.ts        SaveGame JSON CRUD + npcMemory + playerHealth + vehicle{health,destroyed} (migrate() backfills)
    CharacterAssembler.ts Pure buildCharacterPlan + GLTF(skeleton/morphs/layers)/placeholder assembly (useGltf flag, setUseGltf)
    ZoneManager.ts        Zone registry + load/unload
    DialogSystem.ts       Chat: pure state (player/npc/system lines, *emote* vs "speech" parse) + scrollable cinematic GUI + native DOM <input>
    PauseMenu.ts          ESC pause overlay: Resume / Save Game / Load / Quit (pure state + browser GUI)
    WorldHud.ts           Floating NPC/vehicle labels (by key) + [E]/[F] prompt + hero HP bar + bike status
    ClaudeNPCService.ts   Orchestrates an NPC turn via Electron IPC (streaming) + moderate() pre-screen
    NPCManager.ts         Spawns agents, proximity/cooldown, memory serialize, moderate() delegate
    npc/
      ConversationContext.ts  Rolling history + stateless→session graduation
      PromptBuilder.ts        Pure prompt builders (stateless/primer/turn/moderation)
  assets/
    AssetManifest.ts  Typed asset path registry

tests/unit/         Mirrors src/ paths (core, scenes, systems, systems/npc, entities, assets)

docs/
  ADR/              0001-0013 Architecture Decision Records (read before major changes)
  design/           GDD, CHARACTER_SYSTEM, NPC_SYSTEM, WORLD_DESIGN (+ asset catalog), VEHICLE_SYSTEM, COMBAT_SYSTEM
  phases/           PHASE_0..PHASE_10 plans with completion gates
  systems/          INPUT/CAMERA/AUDIO/ASSET_LOADING specs
  testing/          Testing guide + coverage requirements
```

---

## Code Conventions

### Naming
- Classes: `PascalCase` — `GameManager`, `ClaudeNPCSystem`
- Files: `PascalCase.ts` for classes, `camelCase.ts` for utilities
- Interfaces/types: `PascalCase` with `I` prefix only for interface contracts (`IScene`), not for data shapes
- Private fields: no underscore prefix — use `private` keyword
- Constants: `SCREAMING_SNAKE_CASE` for module-level constants

### Patterns
- **Singleton:** Use `static getInstance()` + `static resetInstance()` (for test isolation) — see `GameManager`
- **Service registration:** Register in `GameManager.initialize()`, retrieve via `ServiceLocator.get<T>(key)`
- **Events:** Typed via `GameEvents` interface in `EventBus.ts` — add new events there first
- **Async scenes:** `onEnter()` and `onExit()` are async — await them fully before continuing
- **No God objects:** Each system has one responsibility. Cross-system communication goes through EventBus.

### Testing
- Always use `NullEngine` for Babylon.js tests — never require a real GPU
- Always call `ServiceLocator.clear()` in `afterEach`
- Always call `engine.dispose()` and `scene.dispose()` in `afterEach`
- Mock `child_process.spawn` for Claude CLI tests — never spawn real processes in tests
- Coverage must stay ≥95% lines/functions, ≥90% branches on every PR

---

## How to Create a New Scene

1. Create `src/scenes/MyScene.ts` extending `BaseScene`
2. Implement `onEnter()`, `onExit()`, optionally `update()`
3. Add the scene name to `SceneName` union type in `SceneManager.ts`
4. Register the factory in `src/main.ts` or the scene that transitions to it
5. Write unit tests in `tests/unit/scenes/MyScene.test.ts` using `NullEngine`

```typescript
export class MyScene extends BaseScene {
  async onEnter(): Promise<void> {
    // build scene content here
  }
  async onExit(): Promise<void> {
    // cleanup animations/timers
  }
}
```

---

## How to Create a New System

1. Create `src/systems/MySystem.ts`
2. Register it in `ServiceLocator` during `GameManager.initialize()`
3. Systems communicate only through `EventBus` — never import other systems directly
4. Write tests in `tests/unit/systems/MySystem.test.ts`

---

## How to Add an Asset

1. Search using Sketchfab MCP or Poly Haven API (see `docs/ADR/0005-asset-pipeline.md`)
2. Present 3 options to the user before downloading
3. Place downloaded file in `src/assets/[category]/[name].glb`
4. Create a typed reference in `src/assets/AssetManifest.ts`
5. Document the choice in an ADR update

---

## Commit Format (Conventional Commits)

```
feat(phase-N): description of new feature
fix(system): description of bug fix
test(core): add missing coverage for EventBus
docs(adr): add ADR-0008 for new system
chore: update dependencies
```

---

## Phase Gate Checklist

Before closing a phase:
1. `npm run typecheck` — zero errors
2. `npm test` — all tests pass
3. `npm run coverage` — ≥95% lines/functions
4. Manual smoke test in Electron (`npm run electron:dev`)
5. `git commit` with conventional format

---

## Architecture Decision Records

Read these before making structural changes:

- [ADR-0001](docs/ADR/0001-babylon-typescript.md) — Engine choice: Babylon.js + TypeScript
- [ADR-0002](docs/ADR/0002-electron-wrapper.md) — Desktop wrapper: Electron
- [ADR-0003](docs/ADR/0003-character-modular-gltf.md) — Character system: modular GLTF
- [ADR-0004](docs/ADR/0004-npc-claude-cli.md) — NPC AI: Claude CLI subprocess
- [ADR-0005](docs/ADR/0005-asset-pipeline.md) — Asset pipeline: Sketchfab MCP + Poly Haven
- [ADR-0006](docs/ADR/0006-save-system.md) — Save system: JSON files
- [ADR-0007](docs/ADR/0007-testing-strategy.md) — Testing: Jest + NullEngine + 95% coverage
- [ADR-0008](docs/ADR/0008-world-zones.md) — World architecture: zone/chunk system
- [ADR-0009](docs/ADR/0009-physics-havok.md) — Physics: Havok (isolated from tests)
- [ADR-0010](docs/ADR/0010-npc-conversation-context.md) — NPC conversation: hybrid stateless→session + save persistence
- [ADR-0011](docs/ADR/0011-npc-pre-moderation.md) — NPC content safety: pre-moderation gate (reverts in-prompt guardrails)
- [ADR-0012](docs/ADR/0012-dialog-native-input.md) — Chat UI: native DOM input (non-US keyboards) + emote/speech transcript
- [ADR-0013](docs/ADR/0013-windows-claude-launch.md) — Launching the Claude CLI from Electron (Windows-robust)
- [ADR-0014](docs/ADR/0014-avatar-pipeline-makehuman-morphs.md) — Avatar pipeline (pivoted MakeHuman → Quaternius Ultimate Modular, whole-outfit swap)
- [ADR-0015](docs/ADR/0015-downtown-assets-and-havok-collision.md) — Downtown world assets (Quaternius CC0) + Havok collision
- [ADR-0016](docs/ADR/0016-rpg-stats-power-ratio-checks.md) — RPG foundation: attributes/skills/perks + power-ratio (k=2) checks
- [ADR-0017](docs/ADR/0017-i18n-en-ptbr.md) — In-house i18n (EN / pt-BR), UI + NPC
- [ADR-0018](docs/ADR/0018-living-npcs-autonomy-astar-throttle.md) — Living NPCs: intent deliberation + A* nav + throttled Claude call queue
- [ADR-0019](docs/ADR/0019-turn-based-combat.md) — Turn-based combat (AP from Destreza, power-ratio hit, scalar distance, configurable)
- [ADR-0020](docs/ADR/0020-tactical-multicombatant-combat.md) — Tactical combat: spatial movement + multi-combatant by relationship ledger (no factions); self-following NPC capsule + centralized locomotion
- [ADR-0021](docs/ADR/0021-inventory-items.md) — Inventory + items: weight-capped inventory, melee weapons drive combat (WeaponProfile/FIST_PROFILE), consumables, NPC loadout + corpse loot (firearm/ammo deferred)
- [ADR-0022](docs/ADR/0022-visual-objects-props.md) — Visual objects & props (IN PROGRESS, branch `feat/objects-props`): held-item bone attach + in-game Adjust tool (persisted per-save), paper-doll slots, Hunger system, flashlight/firearm cosmetics, lit-ground road + emissive markings
- [ADR-0023](docs/ADR/0023-action-ribbon-surprise-attack-ranged.md) — Action ribbon (Attack Ranged/Melee · Talk · Inventory) + out-of-combat surprise attack (ambush = first turn) + **real ranged firing** (revokes firearm-cosmetic; ammo still deferred) + live muzzle-flash + combat HUD re-center / updated key hints
