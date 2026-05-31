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

## 3. Enable GLB loading

In a browser/Electron session, GLB loading turns on via
`CharacterAssembler.setUseGltf(true)` (e.g. wired to an Options toggle). It is **off by
default** and a no-op in tests. Missing files fall back to procedural placeholders
per part, so you can enable it even with a partial asset set.
