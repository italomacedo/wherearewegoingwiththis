# Phase 1 — Scene Flow & Core Architecture

**Status:** ✅ Complete (commit 79a1b02)  
**Goal:** Scene navigation infrastructure with fade transitions. No visual content yet.

---

## Deliverables

- SceneManager: register scenes, load/unload, transition with fade
- EventBus integration: emit scene:transition-start / scene:transition-end
- All scenes registered in src/main.ts
- Fade animation using Babylon.js GUI Rectangle overlay

---

## Gate Checklist

- [ ] Splash → Studio → Publisher → MainMenu sequence works headlessly
- [ ] `npm test` — all pass, coverage ≥95%
- [ ] `npm run electron:dev` — window opens and scene sequence runs (black screens in order)
- [ ] Commit: `feat(phase-1): scene flow with fade transitions`

---

## Next: [Phase 2 — UI Shell](PHASE_2_UI_SHELL.md)
