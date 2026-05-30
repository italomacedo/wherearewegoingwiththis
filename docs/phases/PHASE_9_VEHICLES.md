# Phase 9 — Vehicles

**Status:** Pending  
**Goal:** Flying cars and flying Harley Davidsons the player can enter and pilot.

---

## Pre-Phase Tasks

1. Source flying car asset via Sketchfab MCP (present options to user)
2. Source flying motorcycle asset via Sketchfab MCP (present options to user)

---

## Deliverables

- VehicleController: enter/exit (F key), hover flight physics
- Flying car: stable, slower, enclosed cockpit view
- Flying motorcycle: agile, faster, open-air
- Camera switch: vehicle mode (wider, speed-lag)
- Vehicles persist in world where parked (no disappearing)
- Ambient traffic: scripted flyby vehicles over the city skyline

---

## Gate Checklist

- [ ] Player can enter vehicle when close (press F)
- [ ] WASD controls horizontal flight, Space/Ctrl for altitude
- [ ] Exiting vehicle keeps it parked at last position
- [ ] Camera smoothly transitions on enter/exit
- [ ] `npm test` — all pass, coverage ≥95%
- [ ] Manual test: take off, fly across district, land
- [ ] Commit: `feat(phase-9): flying vehicles`

---

## Next: [Phase 10 — Combat](PHASE_10_COMBAT.md)
