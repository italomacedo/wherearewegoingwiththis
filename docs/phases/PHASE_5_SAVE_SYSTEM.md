# Phase 5 — Save System

**Status:** Pending  
**Goal:** Full save/load/delete system with UI.

---

## Deliverables

- SaveSystem class with IPC wrappers (list, load, write, delete)
- LoadGameScene: list of saves with name, date, play time, screenshot thumbnail
- Delete save with confirmation dialog
- New Game creates save immediately on "Begin"
- Autosave system (interval configurable in Options)

---

## Gate Checklist

- [ ] Create → save → load → all data matches
- [ ] Delete removes both .json and .png files
- [ ] Corrupted save shows error gracefully (no crash)
- [ ] Load screen shows thumbnails
- [ ] `npm test` — all pass, coverage ≥95%
- [ ] Commit: `feat(phase-5): save/load system with thumbnail UI`

---

## Next: [Phase 6 — World Foundation](PHASE_6_WORLD.md)
