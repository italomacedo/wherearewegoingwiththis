# ADR-0001 — Engine: Babylon.js + TypeScript

**Status:** Accepted  
**Date:** 2026-05-30

## Context

We need a 3D engine to build a cyberpunk isometric open-world RPG for PC. Requirements:
- TypeScript/JavaScript ecosystem (desired by owner)
- Large community and training data available for AI coding assistants
- 3D rendering: PBR, shadows, animations, physics
- GLTF/GLB asset support (marketplace assets)
- Headless testing capability (no GPU required for CI)
- Active development and long-term support

Evaluated options:
- **Babylon.js** (TypeScript native, Microsoft-backed)
- **Three.js + React Three Fiber** (large React community, but library not engine)
- **PlayCanvas** (WebGL, limited marketplace)
- **Unity C#** (best Asset Store, but not TypeScript)

## Decision

Use **Babylon.js 7.x** as the 3D engine with **TypeScript 5.x** as the primary language.

Key factors:
- TypeScript native (not an afterthought)
- `NullEngine` allows running Babylon.js scene logic in Jest without a GPU — critical for 95% test coverage
- PBR materials + URP-style rendering quality
- Built-in GLTF loader (`@babylonjs/loaders`)
- Babylon GUI for 2D menus and HUD
- Strong animation system (AnimationGroup) for GLTF humanoid rigs
- Physics via Havok (built-in from v6)
- Active community, good documentation, Claude training data coverage

## Consequences

**Positive:**
- Full TypeScript throughout the codebase
- Headless testing with NullEngine enables high coverage
- No engine-specific editor required — pure code + VSCode
- GLTF assets from any marketplace work directly

**Negative:**
- No dedicated game-engine marketplace (unlike Unity Asset Store)
- Assets sourced from Sketchfab/fab.com/Poly Haven and converted as needed
- More manual setup than a full engine (no built-in game loop UI)

## Related

- [ADR-0002](0002-electron-wrapper.md) — Electron as desktop wrapper
- [ADR-0005](0005-asset-pipeline.md) — Asset pipeline
- [ADR-0007](0007-testing-strategy.md) — Testing strategy with NullEngine
