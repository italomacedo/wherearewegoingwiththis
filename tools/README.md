# Animation scrub tool

A standalone Babylon harness to browse a character's **embedded** animation clips
frame-by-frame and find a static pose to FREEZE in-game.

This is how the driving pose was chosen: it's the embedded `Death` clip held at
**frame 20** (reads as a seated driver — knees bent, torso forward, arms out).

## Run

```bash
npm run scrub
```

Then open **http://localhost:5174/tools/anim-scrub.html**
(NOT the site root `/` — that serves the full game, with music.)

## Use

- **Character / Clip** dropdowns — pick the GLB and the clip.
- **Frame slider / ◀-1 / +1▶** — scrub; with *play/loop* unchecked the avatar
  freezes on the slider frame.
- **View** buttons or drag-to-orbit / wheel-zoom.
- The header shows `character · clip [from..to] → freeze at frame N`.

## Apply a found pose in-game

Freeze it from `PlayerController.playPose(clip, frame)`. Clip names in-game are the
renamed ones (`COMBAT_CLIPS`/`LOCO_CLIPS` keys, e.g. `Death` → `death`). Example,
the driving pose in `GameWorldScene`:

```ts
export const DRIVING_POSE_CLIP = 'death';
export const DRIVING_POSE_FRAME = 20;
// on mount:  this.player.playPose(DRIVING_POSE_CLIP, DRIVING_POSE_FRAME);
// on exit:   this.player.playPose(null);
```

Files: `tools/anim-scrub.html`, `src/tools/animScrub.ts`, `vite.scrub.config.ts`.

## Discovered poses (clip + frame)

Static poses carved from embedded Quaternius clips, found via this tool. In-game
clip names are the renamed ones (`death`, etc.); the raw GLB names are noted where
they differ. Apply with `playPose(clip, frame)` (freezes), or for a motion, play a
range (optionally reversed).

| Pose | Clip (in-game name) | Frame | Status |
|---|---|---|---|
| Driving (at the wheel) | `death` (`Death`) | 20 | WIRED — vehicle mount |
| Sit on ground | `roll` (`Roll`) | 65 | available — `playPose('roll', 65)` |
| Passenger / sit on bench | `roll` (`Roll`) | 70 | available — `playPose('roll', 70)` |

`Roll` is kept on the rig via `POSE_CLIPS` in `AvatarMeshCatalog` (clips kept purely
as static-pose sources). Add more clips there to make their frames usable in-game —
the scrub tool loads the raw GLB (all 24 clips), but the game keeps only the mapped
subset (`LOCO_CLIPS` + `COMBAT_CLIPS` + `POSE_CLIPS`).

### Motion ideas (play a range, not a freeze)
- **Open door** = `Sword_Slash` (kept as `slash`) played **in reverse**. Babylon:
  `g.start(false, 1.0, g.to, g.from)` (from>to plays backward), or step `goToFrame`
  down. Would need a small "play clip range/reversed" helper on PlayerController.
