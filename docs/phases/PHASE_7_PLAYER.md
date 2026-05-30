# Phase 7 — Player Controller

**Status:** ✅ Complete (commit 5b5d002). Havok per ADR-0009. Animations
deferred (placeholders have no rig); movement only for now.  
**Goal:** Player character in the world with movement, animations, and camera follow.

---

## Deliverables

- PlayerController: WASD movement relative to camera orientation
- Animations: idle, walk, run (Shift), interact (Space near target)
- AnimationGroup blending (no pop between states)
- Collision with environment
- Character assembled from saved customization data
- Camera transitions to follow player on scene load

---

## Gate Checklist

- [ ] WASD moves player in correct world-relative direction
- [ ] Run animation triggers on Shift hold
- [ ] Animation transitions are smooth (no snap)
- [ ] Player cannot walk through walls
- [ ] `npm test` — all pass, coverage ≥95%
- [ ] Manual test: move through the street scene end-to-end
- [ ] Commit: `feat(phase-7): player controller with GLTF animations`

---

## Next: [Phase 8 — NPC + Claude CLI](PHASE_8_NPC_CLAUDE.md)
