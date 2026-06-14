# Combat System Design (Phase 10+)

> **Implementation status — combat is SHIPPED, and it is turn-based, not the
> speculative real-time firearms/katana-combo/parry design sketched below.** This
> file is kept as the *original aspirational* design; the system actually built
> and merged is **turn-based, AP-driven, multi-combatant melee + ranged**. Read
> these for the real model:
> - [ADR-0019](../ADR/0019-turn-based-combat.md) — turn-based core: `AP = round(Destreza/10)`, scalar distance, power-ratio (k=2) to-hit, hostile-NPC trigger, 3D portraits + turn marker, right-side combat log, Game Over menu.
> - [ADR-0020](../ADR/0020-tactical-multicombatant-combat.md) — spatial movement (grid-A\* around obstacles, on-ground trail), melee ≤1 m, flee >10 m, and **multi-combatant by relationship ledger (no factions)** — recruited sides, allies AI-fight, player-flee-continues, autonomous/spectator NPC↔NPC fights.
> - [ADR-0021](../ADR/0021-inventory-items.md) — weapons drive damage/reach via `WeaponProfile`/`FIST_PROFILE`; NPC loadout → combat weapon + lootable corpse.
> - [ADR-0023](../ADR/0023-action-ribbon-surprise-attack-ranged.md) — action ribbon, out-of-combat **surprise attack** (ambush = first turn), and **real ranged firing** + muzzle-flash (revokes "firearm cosmetic"; ammo/Reload still deferred, **owner-cancelled**).
> - [ADR-0030](../ADR/0030-skill-mechanics.md)/[ADR-0031](../ADR/0031-unified-actions-pipeline.md) — skill-driven combat entry (chat emote → resisted vs surprise → `beginCombat` ambush) via the unified action pipeline.
> - Pervasive HP (player + NPC, `CharacterStats.maxHpFor`) and player-only armor damage reduction ([ADR-0027](../ADR/0027-armor-items.md)).
>
> **No katana combos/parry, no real-time raycast firing, no faction/perception
> system** were built — those parts of the body below are unimplemented design
> notes. See CLAUDE.md's "cRPG / combat model quick-reference" for the live tuning.

> High-level design — detailed implementation planned when Phase 9 completes.

## Philosophy

Combat is optional but always an option. The city reacts to violence — NPCs flee, corpo drones investigate. Getting into a fight has social consequences.

---

## Weapons (Phase 10)

### Firearms

- **Mechanics:** Raycasting from player aim point. Hitscan for pistols/SMGs, projectile for heavy weapons.
- **AI Perception:** Gunshots alert NPCs within radius. NPCs either flee or return fire based on faction.
- **Assets:** Sketchfab MCP: "cyberpunk pistol glb", "cyberpunk SMG glb"

### Katana

- **Mechanics:** Melee hitbox attached to weapon bone. AnimationGroup drives swing timing.
- **Combo system:** Light/Heavy attack buttons, 3-hit combos, finisher animation.
- **Parry window:** Short frame window on block animation — successful parry staggers opponent.
- **Assets:** Sketchfab MCP: "katana cyberpunk glb"

---

## Implants (Phase 10+)

Slot-based system — player has limited implant slots (expandable via upgrades):

| Slot | Example Implants |
|---|---|
| Eyes | Optical zoom, threat detection overlay |
| Arm | Blade deployment, grip strength (melee damage +) |
| Spine | Reflex boost (slow-mo window on dodge), sub-dermal armor |
| Legs | Jump jets, sprint speed boost |
| Brain | Hack drones, interface with corpo systems |

Each implant has:
- **Passive effect:** Always active
- **Active ability:** Triggered with dedicated key, cooldown

---

## Damage Model

- Health bar (HUD) — no regeneration, heal with consumables
- Armor layer from implants/clothing — absorbs a % of damage
- Enemy difficulty scales with zone danger rating
- Death: game over screen, load last autosave or manual save
