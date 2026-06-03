# ADR-0024 — Modular avatars (head + top + bottom) + clothing recolor

**Status:** Accepted — implemented on branch `feat/modular-avatars` (Fase 12).
**Supersedes (partially):** ADR-0014's "avatar = whole-outfit swap" — that remains
the fallback/default look; the composition just generalizes it.

## Context

Avatars used a **whole-outfit swap**: each Quaternius "Ultimate Modular" outfit is a
complete, rigged, self-animated character GLB and `CharacterAppearance.bodyBase` named
exactly one. The owner wanted true modularity — combine the **head** of one mold, the
**upper body** of another and the **lower body** of a third — plus **clothing recolor**
(top and bottom), while keeping the existing skin/eye/hair tinting. Some molds also ship
a **firearm in hand** (Suit/SWAT ♂, SciFi/Medieval ♀) that must be removed, and themed
molds (punk mohawk) wouldn't recolor because their hair uses named colour materials.

## Decision

Implement modular composition by **borrowing region meshes across outfit GLBs and
rebinding them to one shared skeleton by bone index**. This is viable because:

- Each outfit GLB already contains **4 separate region meshes** — `{Name}_Head`,
  `{Name}_Body` (top), `{Name}_Legs` + `{Name}_Feet` (lower) — plus optional weapon/
  accessory meshes, all skinned to the same rig (`CharacterArmature`).
- The skeleton's **joint order is byte-identical across all molds of the same gender**
  (verified from the source glTF `skins.joints`), so a `Head` mesh from outfit A skins
  correctly when its `skeleton` is reassigned to outfit B's skeleton. Composition is
  therefore **within-gender only** (already the top-level pick).

### Locked decisions (owner)
1. **3 axes:** Head · Top (`Body`) · Bottom (`Legs`+`Feet`, feet follow the legs).
2. **Clothing recolor = uniform per region (V1):** the top colour tints *every* clothing
   material on the Body mesh; the bottom colour every clothing material on Legs+Feet.
   Semantic materials (Skin/Eye/Hair/Eyebrows) are excluded. Curated "primary-material-
   only" refinement is deferred — apply per-outfit overrides only where it looks flat.
3. **Hair on themed molds = override table:** `HAIR_MATERIAL_OVERRIDES` maps the named
   mohawk materials (punk `Red`/`Red_Dark`, w_punk `Hair_Brown`/`Brown`) to the hair
   role so the slider recolors them too.
4. **Creator UI:** the single `Outfit ◄►` becomes three cyclers (Head/Top/Bottom) plus
   Top Color + Bottom Color swatches alongside the existing Skin/Eye/Hair.

### Implementation
- **Data (`CharacterData.ts`):** `ColorKey += 'top'` (reuses existing `'bottom'`);
  `AvatarPartRegion = head|top|bottom`; the previously-dormant `avatarPieces` is now the
  per-region outfit map; `resolveAvatarParts(appearance)` resolves each region, inheriting
  `bodyBase` when unset — so an empty map renders the legacy whole-outfit look (no save
  migration needed beyond what `migrateAppearance` already does).
- **Catalog (`AvatarMeshCatalog.ts`, pure):** `partRegionOf(meshName)` (token-boundary
  match, survives Babylon's `_primitiveN` splits); `isStrippableMesh` (weapons +
  accessories); `tintRoleForMaterialInRegion` (semantic → hair override → region clothing);
  `planModularLoad(parts)` dedups the 3 picks into 1–3 GLB loads, marking the `top` outfit
  the skeleton/clip donor.
- **Assembler (`CharacterAssembler.assembleGltf`, browser-only/`istanbul ignore`):** loads
  each source GLB; the donor keeps the shared skeleton + the 11 renamed loco/combat clips;
  each source contributes only its assigned region meshes — borrowed meshes get
  `mesh.skeleton = donorSkeleton` (rebind by index) and reparent to the donor root; weapon/
  accessory meshes are disposed (also fixes the Suit/SWAT pistol-in-hand); tint is region-
  aware. Falls back to the procedural placeholder on load failure.
- **Creator (`CharacterCreatorScene.ts`):** `kind:'part'` controls + `getPart/setPart/
  cyclePart` (Top re-anchors `bodyBase` so the gender source tracks the top pick);
  `setOutfit` resets the composition to a whole outfit; i18n EN/pt-BR labels.

## Consequences
- True mix-and-match within a gender, with no new assets (the 21 existing GLBs are the
  part library) and no rig retargeting.
- Up to 3 GLB loads per assemble; deduped, and the creator already serialized rebuilds.
- Uniform clothing recolor can flatten multi-material outfits (e.g. Suit) — accepted for
  V1; refine with curated overrides later.
- Cross-gender mixing is intentionally unsupported (joint order not guaranteed equal).
- The skeleton-rebind path is browser-only and validated in Electron; pure parts
  (data/region/material-role/plan/migration/schema) are 100% unit-tested.

## Deferred
Per-part feet (separate from legs); curated primary-material clothing tint; clothing
recolor for head accessories; left-hand / two-handed slots; cross-gender mixing.
