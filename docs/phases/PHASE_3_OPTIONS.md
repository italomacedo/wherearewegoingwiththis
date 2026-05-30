# Phase 3 — Options Menu

**Status:** Pending  
**Goal:** Full settings UI with tabs and persistence.

---

## Deliverables

- OptionsScene with 4 tabs: Game Options / Display / Video / Audio
- Settings persisted via electron-store (JSON in userData)
- Claude CLI path field in Game Options (with validation)
- Back button returns to Main Menu

### Game Options Tab
- Difficulty (Easy / Normal / Hard)
- NPC language (English — currently fixed, extensible)
- Subtitles toggle
- Claude CLI executable path (text input + validate button)
- Autosave interval (Off / 5min / 10min / 30min)

### Display Tab
- Resolution selector
- Window mode (Windowed / Fullscreen / Borderless)
- V-Sync toggle
- Isometric camera angle (30°–60° slider)

### Video Tab
- Shadow quality (Off / Low / Medium / High)
- Anti-aliasing (Off / FXAA / MSAA 2x / 4x)
- Post-processing (Off / Low / High) — bloom, chromatic aberration
- Draw distance slider

### Audio Tab
- Master volume
- Music volume
- SFX volume
- NPC voice volume (Claude TTS — future feature)
- Audio output device selector

---

## Gate Checklist

- [ ] All tabs render with correct controls
- [ ] Settings save and reload correctly after restart
- [ ] Claude CLI path validated (file exists + is executable)
- [ ] `npm test` — all pass, coverage ≥95%
- [ ] Commit: `feat(phase-3): options menu with persistence`

---

## Next: [Phase 4 — Character Creator](PHASE_4_CHARACTER_CREATOR.md)
