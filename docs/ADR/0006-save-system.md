# ADR-0006 — Save System: JSON Files via Electron IPC

**Status:** Accepted  
**Date:** 2026-05-30

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
