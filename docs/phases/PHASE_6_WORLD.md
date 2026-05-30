# Phase 6 — World Foundation

**Status:** Pending  
**Goal:** Isometric camera + first playable environment (Mercado das Sombras street scene).

---

## Pre-Phase Question

**City name confirmed:** NeoBeiraRio. Confirm district name: "Mercado das Sombras" (Shadow Market)?

---

## Deliverables

- CameraSystem: ArcRotateCamera at 45°, follow target, Q/E rotation, scroll zoom
- Terrain: asphalt street + sidewalk + building facades (PBR textured)
- Lighting: blue-green neon point lights, distant ambient, rain particle system
- HDRI sky: overcast night from Poly Haven
- Frustum culling: visible chunk only
- Collision geometry for walls/buildings

---

## Gate Checklist

- [ ] Camera follows a test object smoothly
- [ ] Terrain loads with PBR textures
- [ ] Rain particle system renders
- [ ] Q/E rotates view 45°
- [ ] `npm test` — all pass, coverage ≥95%
- [ ] Commit: `feat(phase-6): isometric world foundation`

---

## Next: [Phase 7 — Player Controller](PHASE_7_PLAYER.md)
