# Avatar assets — drop-in guide

The game runs fully **procedurally** until real files land here. When you drop the
files below into the matching folders and enable GLB loading, the avatar pipeline
"just works" (per-part fallback keeps anything still-missing procedural).

> Vite serves this folder at the URL `/assets/`. The CharacterAssembler loads from
> `/assets/<path>` where `<path>` is exactly what `src/assets/AssetManifest.ts` lists.

## 1. Export the base from MakeHuman + MPFB2 (one time)

1. Build a base human in **MakeHuman** (or **MPFB2** inside Blender).
2. Keep the **standard MPFB2 / Mixamo-compatible humanoid rig** (so animations retarget).
3. Make sure facial **morph targets (shape keys)** are exported.
4. Export as **GLB** (via Blender's glTF 2.0 exporter, or convert MakeHuman FBX/DAE → GLB).
5. Save it as `characters/base/body_female_black.glb` (and any other variants you make,
   matching the keys in `CharacterAssets.bases`).

### Confirm the morph-target names
The slider → glTF-target mapping lives in `MORPH_TARGET_NAMES` (`src/assets/AssetManifest.ts`)
as **alias lists**. After your first export, enable GLB loading (step 3 below) and open the
devtools console: any slider whose target wasn't found is logged as
`[Avatar] unmapped morph sliders: …`. Add the real target name to that slider's alias
array — a manifest-only edit, no code changes.

## 2. Drop the rest (as you acquire them — all optional, fallbacks cover gaps)

| Folder | Manifest category | Format |
|---|---|---|
| `characters/base/` | `bases` | `.glb` (rigged) |
| `characters/skin/` | `skinTextures` | `.png` (albedo) |
| `characters/hair/` | `hair` | `.glb` |
| `characters/face/` | `eyebrows`, `beard`, `eyes`, `teeth`, `makeup` | `.glb` (makeup = `.png`) |
| `characters/clothes/tops/` | `clothes.{t_shirt,shirt,long_sleeve,jacket,coat,kutte}` | `.glb` |
| `characters/clothes/bottoms/` | `clothes.{pants,skirt,shorts}` | `.glb` |
| `characters/clothes/belt/` | `clothes.belt` | `.glb` |
| `characters/clothes/footwear/` | `footwear.{socks,shoes,boots,sneakers}` | `.glb` |
| `characters/cyberpunk/implants_visible/` | `implants` | `.glb` |
| `characters/animations/` | `animations.{idle,walk,run,interact}` | `.glb` (Mixamo, "without skin") |

Clothing/hair should share the **same humanoid rig** as the base so one animation drives
everything. Mixamo clips: download **"Without Skin"** and keep bone names.

## 2b. Locomotion animations (rig first — ACTIVE pipeline)

The hero is driven by four shared clips, loaded from **separate GLBs** and **retargeted
onto the base body's skeleton at runtime** (one clip set serves every body). Playback is
automatic: `PlayerController` plays the group whose name contains the state
(`idle`/`walk`/`run`/`interact`) via `selectLocoState`.

**Export contract (do this once):**
1. **Base must keep its skeleton + skin weights.** `Apply Modifiers` in the glTF exporter
   (needed to drop the MPFB helper "robe") strips shape keys — that's fine, we don't use
   runtime morphs — but do **not** apply/remove the **Armature**; the exporter writes the
   rig as skin. Confirm the base GLB still has a skeleton (the console logs
   `[Avatar] GLB meshes …`; a rigged mesh keeps its bones).
2. **Author the clips on the SAME rig.** Easiest path for a non-artist:
   - Import your MakeHuman/MPFB body (FBX) into **Mixamo**, pick **Idle / Walk / Run** (and
     a gesture for *interact*), download each **FBX → "Without Skin", 30 fps**.
   - Convert each FBX → GLB (Blender glTF export, or an FBX2glTF tool).
   - **Bone names must match the base rig** — if base and clips both come from the same
     MakeHuman export (or both auto-rigged by Mixamo), they will.
3. Save the four files as `characters/animations/idle.glb`, `walk.glb`, `run.glb`,
   `interact.glb`.

**Diagnostics on load (devtools console):**
- `[Avatar] loaded anim clip "walk" (…)` — clip found and retargeted.
- `[Avatar] anim "walk" has bones absent from the base rig: …` — bone-name mismatch
  (those bones won't drive anything). If everything is listed here, the rigs differ —
  re-export so bone names match.

> Dedicated clip files **take precedence** over any animation embedded in the base GLB.
> A missing clip just leaves that state un-animated (no crash).

## 3. GLB loading

GLB loading is **on by default** (`CharacterAssembler.useGltf = true`) in browser/Electron
and a **no-op in tests** (`canLoadGltf()` is false without a DOM). Toggle with
`CharacterAssembler.setUseGltf(false)`. Missing files fall back to procedural placeholders
per part, so a partial asset set still runs. The flying bike uses the same approach:
`VehicleController` loads `vehicles/cyberpunk_harley.glb`, falling back to the placeholder.
