# Asset Loading System

## Overview

Centralized asset management: GLTF models, textures, audio. Prevents duplicate loads and provides typed references.

> **Implementation status (this cycle) — gap #4, next target.** The pipeline is
> **dormant**: `AssetManifest` lists intended `public/assets/...` paths but **no files
> exist**; `CharacterAssembler.useGltf=false` (procedural placeholders), though an
> `assembleGltf` path exists (SceneLoader, per-part fallback to placeholder);
> `MercadoSombrasZone.loadRealAssets` is a no-op.
> **Constraint:** the coding agent cannot download/commit binaries here (no asset MCP;
> `WebFetch` returns text). Plan: build+test the loading pipeline so dropping real files
> in "just works", then source assets via owner-supplied files OR runtime CC0 CDN loading
> (Poly Haven) — a decision to confirm. See [WORLD_DESIGN.md](../design/WORLD_DESIGN.md)
> for the curated catalog and [ADR-0005](../ADR/0005-asset-pipeline.md).

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
