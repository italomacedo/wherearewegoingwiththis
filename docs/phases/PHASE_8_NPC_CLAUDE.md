# Phase 8 — NPC + Claude CLI (MVP)

**Status:** ✅ Complete (logic) — commit 99b9cc9. Conversation context per
ADR-0010. GAP: dialog GUI rendering is a stub, so conversation isn't yet
visible on screen (see CLAUDE.md gap #1).  
**Goal:** 1 NPC (Zara) powered by Claude CLI subprocess. Natural conversation + reaction to player actions.

---

## Pre-Phase Questions

1. **NPC name confirmed:** Zara. Confirm personality description for context prompt?
2. **Claude CLI path:** Set in Options before this phase. Default path to test: `claude` (assumes PATH)

---

## Deliverables

- ClaudeNPCSystem: spawn/kill subprocess, stream response via IPC
- NPCAgent entity: state machine (IDLE/AWARE/RESPONDING/COOLDOWN/HOSTILE)
- Dialog UI: speech bubble over NPC, player text input, thinking indicator
- Zara NPC definition placed in GameWorldScene
- Player proximity triggers AWARE state
- Player message → Claude subprocess → streaming response → UI
- NPC reaction to player actions (approach fast, weapon drawn)

---

## Gate Checklist

- [ ] Zara's speech bubble appears when player approaches
- [ ] Player types message → Zara responds via Claude in 1-3 sentences
- [ ] Response streams progressively (not all at once)
- [ ] "Thinking..." shown while Claude processes
- [ ] Claude process killed cleanly on scene change or app close
- [ ] `npm test` — all pass (child_process mocked), coverage ≥95%
- [ ] Manual test: full 5-exchange conversation with Zara
- [ ] Commit: `feat(phase-8): NPC Claude CLI integration — Zara`

---

## **This is the first fully playable milestone.**

---

## Next: [Phase 9 — Vehicles](PHASE_9_VEHICLES.md)
