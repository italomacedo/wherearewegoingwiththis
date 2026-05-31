# ADR-0014 — Avatar pipeline: MakeHuman/MPFB2 base, morph sliders, layered clothing

**Status:** Accepted
**Date:** 2026-05-31
**Extends** [ADR-0003](0003-character-modular-gltf.md) (modular GLTF character) and
[ADR-0005](0005-asset-pipeline.md) (asset pipeline).

## Context

The player avatar was a stand-in: `CharacterAssembler` built procedural spheres/cylinders,
the appearance model was a flat 10-field struct (with `eyeStyle`/`accessories`/`implants`
never rendered), and the Character Creator only cycled body + hair. The owner wants a
deeply customizable hero — full facial control, layered clothing, hair/beard/brows, makeup,
skin variety, and locomotion animations — but has **zero art skill**, and **this
environment cannot download/commit binary assets** (no 3D-asset MCP; `WebFetch` returns
text). So the pipeline must be built **procedural-fallback-first** and the real binaries
supplied by the owner.

Two product decisions were confirmed with the owner up front (each a major
architectural/requirements choice):

- **Base model = MakeHuman + MPFB2** export — realistic rigged human, ~50–60 facial morph
  targets, Mixamo-compatible humanoid skeleton. Chosen over ReadyPlayerMe (no per-feature
  morphs) and low-poly CC0 packs (no morphs) because the owner wants **full morph-target
  face sliders** (nose, nostrils, cheeks, ears, lips, jaw, …), which mandate a
  morph-capable base.
- **Full layered clothing** — base → t-shirt/shirt/long-sleeve → jacket/coat/kutte, plus
  independent belt + footwear; bottoms (pants/skirt/shorts) mutually exclusive.

## Decision

A data-driven, registry-backed appearance model and a pure/browser-split assembler:

- **Model** (`CharacterData.ts`): `CharacterAppearance { bodyBase, slots, morphs, colors,
  skinTexture, accessories, implants }`. `SLOT_REGISTRY` (category/layer/exclusiveGroup/
  manifestKey/colorKey) and `MORPH_REGISTRY` make adding a slot/morph a data edit. Pure
  rules — `applySlot` (exclusion), `resolveLayers` (ordering), `clampMorph` — plus
  accessors and idempotent `migrateAppearance` (legacy flat → new), wired into
  `SaveService.migrate`.
- **Assembler** (`CharacterAssembler.ts`): pure `buildCharacterPlan` resolves base path,
  skin tone/texture, merged colors, clamped+known morph weights, and ordered mesh layers.
  The placeholder path renders every layer per-slot; the GLB path (browser-only) loads the
  base via `LoadAssetContainerAsync`, captures skeleton + animation groups, applies morph
  influences (mapped through alias names), and attaches clothing/hair sharing the rig, with
  per-part placeholder fallback.
- **Morph-name resilience**: MPFB2 target names aren't stable, so `MORPH_TARGET_NAMES` holds
  **alias lists**; `mapMorphName` matches the first present (case-insensitive) and unmatched
  sliders no-op. `diffMorphCoverage` (logged on first real load) tells the owner which
  aliases to add — a manifest-only fix.
- **Animation**: pure `selectLocoState` (speed+sprint+interacting → idle/walk/run/interact),
  driven by `PlayerController.update` with a dt≈0 guard; playback is browser-only.
- **Creator UI**: pure `buildCreatorSchema` + a generic browser widget factory (scrollable
  categories, ◄/► cyclers, sliders, native `<input type=color>`, skin swatches).
- **Acquisition**: owner exports a rigged GLB from MakeHuman/MPFB2 and drops files into
  `public/assets/` (see `public/assets/README.md`); `CharacterAssembler.setUseGltf(true)`
  enables loading. Off by default and a no-op under Jest.

## Consequences

- Every decision (resolution, layering, exclusion, clamping, migration, manifest lookup,
  morph mapping, locomotion state, creator schema) is a **pure, unit-tested** function;
  every GL/DOM call is `typeof`-guarded + `istanbul ignore`d. Coverage stayed ≥95/90 with
  no GPU/DOM.
- Shipped in six green phases with no binary dependency; the game renders a layered,
  animated placeholder avatar today and upgrades to real GLBs the moment files are dropped.
- **Open (owner-side):** export the MakeHuman base, confirm/tune morph-target alias names,
  drop GLBs/PNGs, flip `useGltf`, and verify in Electron. Skin-texture/makeup material
  wiring is stubbed pending the PNGs.
