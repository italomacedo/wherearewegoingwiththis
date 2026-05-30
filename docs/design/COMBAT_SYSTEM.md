# Combat System Design (Phase 10+)

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
