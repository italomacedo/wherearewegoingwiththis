# Audio System

## Overview

Manages background music and spatial SFX. Volume levels controlled by Options settings.

---

## Architecture

```typescript
class AudioSystem {
  private music: Sound | null;
  private sfxPool: Map<string, Sound>;

  initialize(scene: Scene): void;
  playMusic(trackPath: string, fadeInMs?: number): void;
  stopMusic(fadeOutMs?: number): void;
  playSFX(sfxKey: string, position?: Vector3): void;
  setMasterVolume(vol: number): void;   // 0–1
  setMusicVolume(vol: number): void;
  setSFXVolume(vol: number): void;
  dispose(): void;
}
```

---

## Asset Sources

| Type | Source | Format |
|---|---|---|
| Background music | freesound.org CC0, Poly Haven | MP3/OGG |
| Ambient (rain, city) | freesound.org CC0 | OGG |
| UI sounds (click, hover) | Kenney.nl CC0 UI audio | OGG |
| Combat SFX | freesound.org CC0 | OGG |

---

## Spatial Audio

Babylon.js `Sound` with `spatialSound: true` and `distanceModel: 'linear'` for NPCs and SFX sources in the 3D world.

---

## Planned: NPC Voice (Phase 10+)

If Claude CLI supports text-to-speech output in future versions, NPC responses will play as audio in addition to the speech bubble text.
