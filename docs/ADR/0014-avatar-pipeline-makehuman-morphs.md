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

## Addendum (2026-05-31) — reality after wiring MakeHuman/MPFB2 end-to-end

Verified in Electron with a real MPFB2 export. Three findings reshaped the design:

1. **No fine facial shape keys.** MPFB applies its detail targets (nose/ears/lips/jaw…)
   directly to vertices, not as Blender shape keys, so the GLB exports **zero** fine morph
   targets. Only ~6 *macro* targets (ethnicity + breast) ever appeared. The 36 in-game
   morph sliders had nothing to drive, so they were **removed** from the creator. The morph
   plumbing (`MORPH_REGISTRY`, `buildCharacterPlan.morphs`, `resolveMorphInfluences`,
   `setMorph`) remains dormant for a future morph-capable base.
2. **Helper "robe" vs shape keys conflict.** MakeHuman's basemesh ships helper geometry
   (clothes/joint proxy) hidden by a Mask modifier. Exporting needs **Apply Modifiers** to
   drop it — but applying a vertex-count-changing modifier **strips all shape keys**. So you
   can't keep macro morphs *and* a clean mesh in one export. We therefore do **not** rely on
   runtime morphs at all.
3. **Pivot — ethnicity by file, not morph.** Ethnicity is now one **GLB per ethnicity**
   (`body_<gender>_<ethnicity>`), matching MakeHuman's Race vocabulary exactly:
   **african / asian / caucasian / universal** (no latino). The creator's gender + ethnicity
   buttons select the matching GLB (`bodyBaseKey`/`parseGender`/`parseEthnicity`); each
   ethnicity is an independent clean export (Apply Modifiers on, shape keys irrelevant).

**Working today (real GLB):** gender + ethnicity (file switch) + **skin-tone tint**
(`applySkinTexture` sets PBR `albedoColor`). UI cleaned up (BEGIN bottom-right, makeup
removed, no dead sliders). Missing per-slot GLBs are skipped (no floating placeholders).
**Deferred:** rig + Mixamo animation, hair/clothing GLBs, skin-texture PNGs (tint→texture),
optional bust slider. The 8 base files are currently copies of one export until distinct
per-ethnicity exports are dropped.

## Addendum 2 (2026-05-31) — rig + locomotion animation, end-to-end

The hero is now rigged and animated in Electron. Decisions and findings:

1. **Rig via Mixamo, not the MPFB rig.** The owner can't upload GLB to Mixamo (it accepts
   only FBX/OBJ/ZIP), so the body is exported from Blender as **FBX**, **auto-rigged in
   Mixamo**, and the rigged character is re-downloaded **with skin** as the new base GLB.
   This sidesteps Addendum-1's `Apply Modifiers`/shape-key problem (we don't use morphs) and
   guarantees **bone-name parity**: base and clips all carry `mixamorig:*` bones (65), so
   retargeting is a pure name match.
2. **Shared, separate clips — retargeted at runtime.** `assembleGltf.loadAnimationClips`
   loads the four manifest GLBs (`characters/animations/{idle,walk,run,interact}.glb`),
   **clones each `AnimationGroup` onto the base skeleton** by lowercased bone name, and
   **renames the group to the manifest key** (Mixamo names every clip
   `Armature|mixamo.com|Layer0`, so name-based playback in `PlayerController` needs the
   rename). Dedicated clips take precedence over any embedded in the base; missing clips
   leave that state un-animated (no crash). `diffSkeletonBones` (pure, tested) reports
   bone-name mismatches in the console.
3. **Orientation: Mixamo faces +Z — no flip.** Addendum-1's MPFB base faced away, so the
   loader rotated the model 180°. The Mixamo base faces **+Z**, which is our world "forward"
   at `rotation.y = 0`, so `PlayerController`'s `root.rotation.y = facing` aligns the body
   with travel **only if we do NOT rotate**. Keeping the 180° produced a "moonwalk" (body
   180° from movement). Fix: **removed the flip** in `assembleGltf`, and moved the creator's
   preview camera to `alpha = +π/2` so it still faces the model's front. A base that faces
   −Z would need the π back — both call sites carry a comment.
4. **FBX→GLB conversion is scripted.** `scripts/convert_anims.py` runs headless
   (`blender --background --python`) to batch-convert the Mixamo FBX clips to GLB with the
   engine names. Reusable for future clips (extend its `MAPPING`).

**Also reused for vehicles:** `VehicleController` loads `vehicles/cyberpunk_harley.glb` via
the same guarded-load + placeholder-fallback pattern (`useGltf`/`canLoadGltf`).

## Addendum 3 (2026-06-01) — MakeHuman quality ceiling, and why we left it

After rig+animation worked, the owner judged the result **aesthetically subpar**: MakeHuman's
realistic-but-mid base, dated community clothing, and a bald/barefoot default never
consolidated into a cohesive hero. We tried a "**bake every selectable piece into one rigged
GLB + toggle visibility per slot**" model (dress the MakeHuman with all hair/clothes, rig the
lot in Mixamo, `resolveVisibleMeshes` + per-piece tint). It worked mechanically (and taught us
the per-material tint + visibility-toggle pattern) but: (a) overlapping/positioning glitches,
(b) clothing skinned to a different bone order distorted, and most importantly (c) **the art
ceiling is MakeHuman's, not a bug**. For an **isometric** game (far camera), a *stylized,
cohesive* character reads far better than mid-realism. Decision: **cut losses and pivot.** The
animation-retarget pipeline and the creator architecture (slots, tint, cyclers) are portable,
so the pivot wasn't from zero.

## Addendum 4 (2026-06-01) — Pivot to Quaternius "Ultimate Modular" (current)

**Avatar source is now Quaternius Ultimate Modular Men/Women (CC0), not MakeHuman.** Each
"outfit" is a complete, rigged, **self-animated** character GLB (Punk, SWAT, Suit, Hoodie,
Sci-Fi, Soldier… — 11 ♂ + 10 ♀) with the 4 parts (Body/Legs/Feet/Head) + 24 embedded clips on
one Quaternius rig. **Model = whole-outfit swap** (`AvatarMeshCatalog.OUTFITS`), not per-part
mixing (the parts exist for future mixing).

- **No external animation library / no Mixamo / no hair attach** — clips are embedded;
  `assembleGltf` keeps the 4 locomotion clips (`Idle`/`Walk`/`Run`/`Interact`), **renames** them
  to `idle/walk/run/interact` (so `PlayerController` name-matching plays exactly one), and
  disposes the other 20.
- **Tint by semantic material name** (`tintRoleForMaterial`): `Skin`→skin tone, `Eye`→eye,
  `Eyebrows`/`Hair*`→hair. Per-outfit clothing keeps its authored colours.
- **Faces +Z** (no flip), reuses the creator-camera `alpha=+π/2`.
- **Creator**: Gender · Skin Tone · Eye Color · **Outfit ◄►** (gender-filtered) · Hair Color.
  Ethnicity dropped (→ skin tone); `avatarPieces` field kept dormant for future part-mixing.
- **Assets**: `characters/quaternius/{men,women}/*.glb` (~38 MB total). `scripts/convert_outfits.py`
  batch-converts the pack's "Individual Characters" glTF → GLB headless.
- **Cleanup**: all MakeHuman/Mixamo/superhero assets (~326 MB) and the dead
  `classifyBakedMaterial`/Mixamo-clip code were removed.

**Deferred:** per-part outfit mixing (Body of one + Legs of another — the pack's "Separate
Skeletal Meshes" support it), clothing recolour, Quaternius environment packs for gap #4.
