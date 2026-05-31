# Phase 9 — Vehicles

**Status:** 🟡 MVP done (flying motorcycle). Decisions: simplified lift/drag flight
model + MVP-first scope (confirmed with user). Flying car + ambient traffic deferred
to a follow-up pass.  
**Goal:** Flying cars and flying Harley Davidsons the player can enter and pilot.

---

## Pre-Phase Tasks / Decisions

1. **Flight model:** simplified lift/drag (thrust → velocity → drag → clamped
   altitude), implemented as a *pure* `VehicleController.computeFlightStep` so it
   stays headless-testable. Havok body path deferred like PlayerController.
2. **Scope:** MVP first — one vehicle (flying motorcycle), procedural placeholder
   mesh (no GLB download, per asset policy).
3. Assets (GLB car/bike) — still procedural; sourcing deferred with gap #4.

---

## Deliverables

- ✅ `VehicleController`: enter/exit, simplified lift/drag flight (`computeFlightStep`)
- ✅ Flying motorcycle: agile, open-air, procedural neon placeholder
- ✅ Camera switch: `CameraSystem.enterVehicleMode/exitVehicleMode` (wider radius, lower damping = speed-lag)
- ✅ Vehicle persists in world where parked (stays at last position on dismount)
- ✅ Input: F = mount/dismount, WASD = horizontal, Space/Ctrl = altitude (`getVerticalAxis`)
- ✅ **Damage model (health):** dismounting mid-air drops the hero (gravity + fall
  damage); an abandoned bike free-falls and crashes (impact damage). Bike at
  critical HP smokes; at 0 HP it **explodes** into an unmountable wreck. Hero death
  → game over (Main Menu). HP + bike state persisted in the save.
- ⬜ Flying car (stable, slower, enclosed) — follow-up
- ⬜ Ambient traffic: scripted flyby vehicles — follow-up

---

## Gate Checklist

- [x] Player can enter vehicle when close (press F)
- [x] WASD controls horizontal flight, Space/Ctrl for altitude
- [x] Exiting vehicle keeps it parked at last position
- [x] Camera transitions to vehicle mode on enter/exit
- [x] Floating **"Flying Bike"** label + **"[F] Enter/Exit bike"** HUD prompt (`WorldHud`)
- [x] Health/fall/crash/smoke/explode + hero game-over (HP bar + bike status in HUD)
- [x] `npm test` — all pass (513), coverage ≥95%
- [ ] Manual test in Electron: take off, fly up, dismount mid-air (hero falls + bike crashes)
- [ ] Commit: `feat(phase-9): flying motorcycle MVP`

> Controls note: camera rotation is **hold Z / C** (left/right, continuous 360°) —
> middle-mouse drag also works but is browser-only/untested. WASD is camera-relative;
> Space/Ctrl change altitude; F mounts/dismounts.

---

## Notes / Future Work

- Bike **HP + destroyed** state IS persisted (`SaveGame.vehicle`); its parked
  *position* is not yet persisted (resets to the spawn dock each load).
- Health model decisions (confirmed): hero death = **game over → Main Menu**; HP is
  **persisted** in the save. Fall is unrecoverable mid-air (no air-brake) by design.
- While piloting, the player mesh is disabled and the camera follows the vehicle;
  NPC proximity still tracks the (parked) player position.
- Tuning lives in `DEFAULT_VEHICLE_CONFIG` (safeImpactSpeed/damagePerSpeed) and
  `DEFAULT_PLAYER_CONFIG` (gravity/safeFallSpeed/fallDamagePerSpeed).

---

## Next: [Phase 10 — Combat](PHASE_10_COMBAT.md)
