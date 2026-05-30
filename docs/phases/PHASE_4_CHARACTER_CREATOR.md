# Phase 4 — Character Creator

**Status:** Pending  
**Goal:** Modular GLTF character customization from nude base to fully equipped operative.

---

## Pre-Phase Tasks

1. Source base body assets via Sketchfab MCP (8 variants — present options to user)
2. Source initial hair set (minimum 6 styles)
3. Source initial clothes set (minimum 3 tops, 3 bottoms, 3 shoes)
4. Source 2 visible implants for initial release feel

---

## Deliverables

- CharacterCreatorScene with 3D preview (rotatable)
- Body selector: 8 base variants
- Skin tone color picker
- Hair style selector (◄ ► navigation) + hair color picker
- Clothing selectors per slot (top, bottom, shoes, accessories)
- Augmentation/implant slots
- Character name input
- "Begin" button → SaveSystem.createNewGame() → GameWorldScene

---

## Gate Checklist

- [ ] Switching any slot updates 3D preview without error
- [ ] All slots are independent (no cross-slot artifacts)
- [ ] Character data serializes/deserializes correctly
- [ ] `npm test` — all pass, coverage ≥95%
- [ ] Manual test: create character with all slots filled → begins game
- [ ] Commit: `feat(phase-4): modular GLTF character creator`

---

## Next: [Phase 5 — Save System](PHASE_5_SAVE_SYSTEM.md)
