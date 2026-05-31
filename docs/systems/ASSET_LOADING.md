# Asset Loading System

## Overview

Centralized asset management: GLTF models, textures, audio. Prevents duplicate loads and provides typed references.

> **Implementation status — avatar pipeline LIVE ([ADR-0014](../ADR/0014-avatar-pipeline-makehuman-morphs.md) + addendum).**
> Real MakeHuman/MPFB2 base GLBs load in Electron: `CharacterAssembler.useGltf=true`, the
> glTF loader is registered (`import '@babylonjs/loaders/glTF'`), the base is rotated 180°
> to face the camera, and missing per-slot GLBs are skipped. `AssetManifest` carries the
> character categories (8 bases keyed `body_<gender>_<african|asian|caucasian|universal>`,
> skin textures, hair, eyebrows/beard/eyes/teeth, layered clothing, footwear, animations)
> plus pure `resolveAssetPath`/`resolveBasePath`/`listAssetKeys`. `CharacterAssembler` has a
> pure `buildCharacterPlan` + browser `assembleGltf` (skeleton, attached layers, skin-tone
> tint via `applySkinTexture`, per-part fallback).
> **Customization is by whole-GLB swap, not morphs** — MPFB exports no fine shape keys and
> `Apply Modifiers` strips the macro ones (see Lesson 17 / ADR-0014 addendum), so the
> morph-name map (`MORPH_TARGET_NAMES`/`mapMorphName`/`diffMorphCoverage`) and `morphs` are
> **dormant** (kept for a future shape-key base). `public/assets/characters/base/` holds 8
> base GLBs (currently copies of one MPFB export). **Owner follow-ups:** distinct
> per-ethnicity exports, hair/clothing GLBs, skin-texture PNGs, rig + Mixamo animation
> clips — drop into the matching folders (see `public/assets/README.md`). Environment/world
> assets (gap #4) still pending; see [WORLD_DESIGN.md](../design/WORLD_DESIGN.md) and
> [ADR-0005](../ADR/0005-asset-pipeline.md).

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
