# Asset Loading System

## Overview

Centralized asset management: GLTF models, textures, audio. Prevents duplicate loads and provides typed references.

> **Implementation status — avatar pipeline built ([ADR-0014](../ADR/0014-avatar-pipeline-makehuman-morphs.md)).**
> The character loading pipeline is now **built and tested** (procedural-fallback-first):
> `AssetManifest` carries the full character categories (bases, skin textures, hair,
> eyebrows/beard/eyes/teeth/makeup, layered clothing, footwear, animations) plus pure
> `resolveAssetPath`/`resolveBasePath`/`listAssetKeys` and the morph-name map
> (`MORPH_TARGET_NAMES`/`mapMorphName`/`diffMorphCoverage`). `CharacterAssembler` has a pure
> `buildCharacterPlan` + a browser `assembleGltf` (skeleton, morph targets, attached layers,
> per-part fallback). `CharacterAssembler.useGltf=false` by default (toggle `setUseGltf`).
> **The `public/assets/` tree is scaffolded** (folders + `README.md`); it still ships **no
> binaries** — the coding agent cannot download/commit them. Owner action: export a rigged
> GLB from MakeHuman/MPFB2 + drop files (see `public/assets/README.md`), confirm morph-target
> names, then flip `useGltf`. Environment/world assets (gap #4) still pending; see
> [WORLD_DESIGN.md](../design/WORLD_DESIGN.md) and [ADR-0005](../ADR/0005-asset-pipeline.md).

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
