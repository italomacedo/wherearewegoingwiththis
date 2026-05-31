# ADR-0012 — Chat UI: Native DOM `<input>` over Babylon GUI InputText

**Status:** Accepted
**Date:** 2026-05-30

## Context

The NPC chat needs a text field, a scrollable transcript, and a clear distinction
between spoken lines and roleplay actions. Two issues drove decisions:

1. **Babylon GUI `InputText` mangles non-US keyboards.** It reconstructs text from raw
   key events, so on a Brazilian ABNT2 layout the player could not type `?`, accents
   (ç ã é), dead keys, or use IME / paste. The owner hit this immediately.
2. **No conversation history was visible** and emotes weren't distinguishable from
   speech; the panel also clipped the SEND button.

## Decision

### 1. Native DOM `<input>` for text entry

Replace Babylon GUI `InputText` with a **native HTML `<input>`** overlaid on the canvas
(`DialogSystem.buildDomInput`). The OS handles layout/accents/IME/paste correctly. Its
`keydown` does `stopPropagation()` so typing never drives the game's `InputSystem`
(WASD etc.); Enter submits; a DOM SEND button submits. The canvas-drawn panel renders
the transcript/labels (display), the DOM element owns text input.

> Rule of thumb (now Lesson 15 in CLAUDE.md): **Babylon GUI is fine for display, not for
> real text entry.**

### 2. Cinematic transcript + emote/speech parsing

`DialogSystem` keeps a pure line model (`{role: 'player'|'npc'|'system', text}`),
seeded with prior history on open. A pure `parseSegments(text)` splits a line into
`*emote*` vs `"speech"` segments, styled differently and **per speaker** (player can
roleplay actions or mix them with dialogue; the NPC prompt is told `*asterisks*` are
actions). Rendered in a Babylon GUI `ScrollViewer` + `Grid` layout so the SEND button is
never clipped. The component is **generic** — `open(displayName, seed)` works for any NPC.

## Testability

- Pure state (lines, roles, open/close, focus flag) and `parseSegments` are unit-tested.
- All Babylon GUI + DOM rendering is browser-only (`typeof document` guard +
  `/* istanbul ignore next */`); covered by the Electron smoke test, not Jest.

## Consequences

**Positive:** correct international text input; visible, readable, cinematic history;
reusable across NPCs; emote/speech roleplay on both sides.

**Negative:** a DOM element positioned over the canvas must be kept roughly aligned with
the canvas panel (fixed bottom-center); the streamed raw NPC text shows briefly before
the final text replaces it.

## Related

- [ADR-0001](0001-babylon-typescript.md) — Babylon.js engine
- [ADR-0011](0011-npc-pre-moderation.md) — the `system` dialog role is used for refusals
- [docs/design/NPC_SYSTEM.md](../design/NPC_SYSTEM.md)
