# Asset Loading System

## Overview

Centralized asset management: GLTF models, textures, audio. Prevents duplicate loads and provides typed references.

---

## AssetManifest

All assets referenced by key in `src/assets/AssetManifest.ts`:

```typescript
export const CharacterAssets = {
  bases: {
    female_asian: 'characters/base/body_female_asian.glb',
    female_black: 'characters/base/body_female_black.glb',
    // ...
  },
  hair: {
    undercut_01: 'characters/hair/hair_undercut_01.glb',
    // ...
  },
} as const;

export type CharacterBaseKey = keyof typeof CharacterAssets.bases;
```

---

## Loading via Babylon.js SceneLoader

```typescript
import { SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders/glTF'; // registers GLTF loader

const result = await SceneLoader.ImportMeshAsync(
  '',
  '/assets/',
  'characters/base/body_female_black.glb',
  scene
);
```

---

## Caching

Babylon.js `AssetsManager` used for batch preloading at scene entry. Assets cached in memory for the scene lifetime — disposed with scene.

---

## Asset Directory Structure

```
src/assets/
  characters/
    base/           body GLBs
    hair/           hair GLBs
    face/           face detail GLBs
    clothes/        clothing GLBs by slot
    cyberpunk/      implant and augmentation GLBs
    animations/     shared animation GLBs
  environment/
    textures/       PBR textures (from Poly Haven)
    models/         buildings, props, vehicles
    hdri/           HDRI environment maps
  audio/
    music/          background tracks
    sfx/            sound effects
    ambient/        rain, city noise
  ui/
    fonts/          web fonts for menus
    icons/          PNG icons for UI
```
