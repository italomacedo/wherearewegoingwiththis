# ADR-0006 — Save System: JSON Files via Electron IPC

**Status:** Accepted — **implemented in Fase 18** (file-based IPC, as originally decided).  
**Date:** 2026-05-30 (decision) · 2026-06 (implementation)

## Implementation note (Fase 18)

This ADR's decision (JSON files via IPC) was the intent from day one, but the
build shipped an interim `SaveService` backed by **`localStorage`**. That has a
hard **~5 MB per-origin quota**, and `save()` had no `try/catch` around
`setItem` — so once the procedural world's `npcMemory` grew past the cap, a
`QuotaExceededError` silently aborted the write and **the save vanished on the
next launch** (the reported bug). Fase 18 implemented the file backend as
specified below, fixing the bug at its root (disk has no such cap):

- **Main process** (`electron/main.ts`): `save:list` / `save:load` / `save:write`
  / `save:delete` handlers over `app.getPath('userData')/saves/*.json`. `save:write`
  writes a `*.tmp` then renames (atomic / corruption-safe).
- **Renderer** (`SaveService`): keeps its **synchronous** API (scenes read
  `load()`/`listMeta()` synchronously). `init()` hydrates the in-memory store
  from disk once at boot (`src/main.ts` awaits it before `game.start()`);
  `save()`/`delete()` write through to disk via the bridge. `init()` also
  one-time-imports any legacy `localStorage` saves to disk so no game is lost.
  `localStorage` remains a fallback for the browser preview (its `setItem` is now
  wrapped so a quota error can never abort the in-memory save); tests use the
  in-memory store.

NPC memory is kept lean alongside this (see ADR-0029 "Save deltas"): a defeated
NPC collapses to `{ defeated, inventory }`; the save also stores dropped
`groundItems`.

## Context

The game needs persistent save games. Requirements:
- Multiple save slots
- Human-readable format (debuggable)
- Include character customization, world position, game flags
- Screenshot thumbnail per save
- Delete individual saves
- Load game screen shows save metadata

## Decision

Store saves as **JSON files** in `app.getPath('userData')/saves/[saveId].json`.  
Screenshot thumbnails stored as `[saveId].png` alongside.

### Save Schema

```typescript
interface SaveGame {
  saveId: string;          // UUID v4
  saveName: string;        // player-defined or auto "Save 1"
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
  gameTimeSeconds: number; // in-game time elapsed

  character: {
    name: string;
    bodyBase: string;      // asset key
    skinTone: string;      // hex color
    hair: string;          // asset key
    hairColor: string;     // hex color
    eyes: string;          // asset key
    clothes: {
      top: string | null;
      bottom: string | null;
      shoes: string | null;
      accessories: string[];
    };
    implants: string[];    // visible augmentation asset keys
  };

  world: {
    zone: string;          // zone identifier
    position: [number, number, number];  // x, y, z
    rotation: number;      // y-axis rotation in radians
  };

  flags: Record<string, boolean | number | string>;  // quest/story flags
}
```

### File Structure

```
%APPDATA%/where-are-we-going-with-this/saves/
  [saveId].json
  [saveId].png   (thumbnail, 320x180)
```

### IPC API

All file I/O goes through Electron IPC (renderer cannot access fs directly):
- `save:list` → returns metadata array
- `save:load(saveId)` → returns full SaveGame
- `save:write(saveGame)` → writes JSON + thumbnail
- `save:delete(saveId)` → removes .json and .png

## Consequences

**Positive:**
- Human-readable JSON — easy to debug, easy to migrate
- No database dependency
- Thumbnails make the load screen visually informative

**Negative:**
- No built-in corruption protection — mitigated by writing to temp file then renaming
- Save files can be edited by players (cheat protection is out of scope)

## Related

- [docs/design/CHARACTER_SYSTEM.md](../design/CHARACTER_SYSTEM.md) — character data shape
