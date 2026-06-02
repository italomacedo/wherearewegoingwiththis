import {
  Scene, AbstractMesh, MeshBuilder, StandardMaterial,
  Color3, Vector3, Mesh,
} from '@babylonjs/core';
import type { Skeleton, AnimationGroup } from '@babylonjs/core';
import {
  CharacterAppearance, SlotId, SlotCategory, ColorKey, MorphId,
  DEFAULT_COLORS, MORPH_REGISTRY, resolveLayers, getSkinTone, clampMorph,
} from '@entities/CharacterData';
import { CharacterAssets, resolveAssetPath, resolveBasePath, mapMorphName } from '@assets/AssetManifest';
import { outfitByKey, DEFAULT_OUTFIT, LOCO_CLIPS, COMBAT_CLIPS, tintRoleForMaterial, genderOfOutfit } from '@assets/AvatarMeshCatalog';

export interface AssembledCharacter {
  rootMesh: AbstractMesh;
  meshes: AbstractMesh[];
  dispose(): void;
  /** Live-update a facial morph (GLB mode only; no-op/undefined for placeholders). */
  setMorph?(morphId: MorphId, weight: number): void;
  /** Shared humanoid skeleton (GLB mode only). */
  getSkeleton?(): Skeleton | null;
  /** Locomotion animation groups from the rigged base (GLB mode only). */
  getAnimationGroups?(): AnimationGroup[];
}

// ─── Character plan (pure — no scene, fully unit-testable) ──────────────────────

export interface SlotPlanEntry {
  slot: SlotId;
  category: SlotCategory;
  assetKey: string;
  /** Resolved manifest path, or null if the asset key isn't in the manifest. */
  manifestPath: string | null;
  layer: number;
  colorKey?: ColorKey;
}

export interface MorphPlanEntry {
  morphId: MorphId;
  weight: number; // clamped 0..1
}

export interface CharacterPlan {
  basePath: string;
  skinTone: string;
  skinTexturePath: string | null;
  colors: Record<ColorKey, string>;
  morphs: MorphPlanEntry[];
  /** Mesh-producing slots, ordered by layer (lowest first). */
  layers: SlotPlanEntry[];
  makeup: { assetKey: string; path: string | null } | null;
}

/**
 * Pure resolution of an appearance into an ordered, fully-resolved build plan:
 * base path, skin texture/tint, per-region colors, clamped+known morph weights,
 * and ordered mesh layers with their manifest paths. No Babylon/scene access —
 * this is the unit-tested heart of the assembler.
 */
export function buildCharacterPlan(appearance: CharacterAppearance): CharacterPlan {
  const colors: Record<ColorKey, string> = { ...DEFAULT_COLORS, ...appearance.colors };

  const layers: SlotPlanEntry[] = resolveLayers(appearance).map((l) => ({
    slot: l.slot,
    category: l.def.category,
    assetKey: l.value,
    manifestPath: resolveAssetPath(l.def.manifestKey, l.value),
    layer: l.def.layer,
    colorKey: l.def.colorKey,
  }));

  const morphs: MorphPlanEntry[] = Object.entries(appearance.morphs)
    .filter(([id, w]) => MORPH_REGISTRY[id] !== undefined && typeof w === 'number')
    .map(([id, w]) => ({ morphId: id, weight: clampMorph(w as number) }));

  const skinTexturePath =
    (CharacterAssets.skinTextures as Record<string, string>)[appearance.skinTexture] ?? null;

  const makeupKey = appearance.slots.makeup ?? null;
  const makeup = makeupKey
    ? { assetKey: makeupKey, path: resolveAssetPath('makeup', makeupKey) }
    : null;

  return {
    basePath: resolveBasePath(appearance.bodyBase),
    skinTone: getSkinTone(appearance),
    skinTexturePath,
    colors,
    morphs,
    layers,
    makeup,
  };
}

/**
 * Maps planned morph weights onto the glTF morph-target names actually present
 * on the loaded mesh (via the alias table). Sliders whose target isn't found
 * are dropped — graceful degradation rather than a crash. Pure + testable.
 */
export function resolveMorphInfluences(
  morphs: MorphPlanEntry[],
  availableTargetNames: string[],
): Array<{ name: string; weight: number }> {
  const out: Array<{ name: string; weight: number }> = [];
  for (const m of morphs) {
    const name = mapMorphName(m.morphId, availableTargetNames);
    if (name) out.push({ name, weight: m.weight });
  }
  return out;
}

// Placeholder tints for clothing/footwear slots that carry no color picker.
const CLOTHING_TINTS: Partial<Record<SlotId, string>> = {
  t_shirt: '#2A3A4A', shirt: '#223344', long_sleeve: '#1E2E3E',
  jacket: '#3A2A4A', coat: '#2A2A2A', kutte: '#1A1A1A',
  belt: '#4A3A1A', pants: '#1A2A3A', skirt: '#3A1A2A', shorts: '#2A2A1A',
  socks: '#888888', shoes: '#222222', boots: '#111111', sneakers: '#0A2A2A',
};

// Placeholder geometry per clothing/footwear slot: height, y-position, diameter.
const SLOT_GEOM: Partial<Record<SlotId, { h: number; y: number; d: number }>> = {
  t_shirt: { h: 0.55, y: 1.2, d: 0.40 }, shirt: { h: 0.58, y: 1.2, d: 0.41 },
  long_sleeve: { h: 0.6, y: 1.2, d: 0.42 },
  jacket: { h: 0.62, y: 1.2, d: 0.44 }, coat: { h: 0.9, y: 1.05, d: 0.46 },
  kutte: { h: 0.5, y: 1.25, d: 0.48 }, belt: { h: 0.1, y: 0.92, d: 0.40 },
  pants: { h: 0.7, y: 0.65, d: 0.34 }, skirt: { h: 0.5, y: 0.7, d: 0.5 },
  shorts: { h: 0.35, y: 0.82, d: 0.36 },
  socks: { h: 0.2, y: 0.32, d: 0.14 }, shoes: { h: 0.12, y: 0.25, d: 0.18 },
  boots: { h: 0.3, y: 0.32, d: 0.2 }, sneakers: { h: 0.14, y: 0.25, d: 0.2 },
};

// Placeholder y-position for face features / facial hair.
const FACE_GEOM: Partial<Record<SlotId, { y: number; d: number; flatten: number }>> = {
  eyes: { y: 1.72, d: 0.06, flatten: 1 },
  teeth: { y: 1.64, d: 0.07, flatten: 0.4 },
  eyebrows: { y: 1.76, d: 0.1, flatten: 0.3 },
  beard: { y: 1.6, d: 0.18, flatten: 0.6 },
};

/**
 * Assembles a character from GLTF parts (or procedural placeholders when
 * GLTF files are not yet available).
 *
 * Real GLTF loading is guarded by `canLoadGltf()` — in Node.js/Jest it falls
 * back to placeholder geometry so tests never touch the filesystem.
 */
export class CharacterAssembler {
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Whether to load real GLTF assets. Enabled now that real base GLBs are being
   * dropped into public/assets/; any part whose GLB is still missing falls back
   * to procedural placeholder per-part. A no-op under Jest (canLoadGltf() false),
   * so tests stay on the placeholder path.
   */
  static useGltf = true;

  /**
   * Enable/disable real GLB loading at runtime — e.g. from Options once the
   * owner has dropped exported GLBs into public/assets/. Kept false by default
   * (and a no-op under Jest, where canLoadGltf() is false) so tests stay on
   * the procedural placeholder path.
   */
  static setUseGltf(enabled: boolean): void {
    CharacterAssembler.useGltf = enabled;
  }

  /** Returns true when SceneLoader is available (browser/Electron only) */
  static canLoadGltf(): boolean {
    return typeof document !== 'undefined';
  }

  async assemble(appearance: CharacterAppearance): Promise<AssembledCharacter> {
    if (CharacterAssembler.useGltf && CharacterAssembler.canLoadGltf()) {
      /* istanbul ignore next — GLTF loading enabled only when real assets exist */
      return this.assembleGltf(appearance);
    }
    return this.assemblePlaceholder(appearance);
  }

  /* istanbul ignore next — browser/Electron only; exercised via manual verification */
  private async assembleGltf(appearance: CharacterAppearance): Promise<AssembledCharacter> {
    const { SceneLoader } = await import('@babylonjs/core');
    await import('@babylonjs/loaders/glTF'); // registers the .glb/.gltf loader plugin
    const meshes: AbstractMesh[] = [];
    let skeleton: Skeleton | null = null;
    let animationGroups: AnimationGroup[] = [];
    const colors = { ...DEFAULT_COLORS, ...appearance.colors };
    const outfit = outfitByKey(appearance.bodyBase) ?? outfitByKey(DEFAULT_OUTFIT)!;

    /* eslint-disable no-console */
    // ─── Outfit (a complete Quaternius character: parts + rig + embedded clips) ─
    try {
      const container = await SceneLoader.LoadAssetContainerAsync('/assets/', outfit.path, this.scene);
      container.addAllToScene();
      meshes.push(...container.meshes);
      skeleton = container.skeletons[0] ?? null;
      // Quaternius faces +Z (= our world forward at rotation.y=0) → no flip.
      this.tintAvatarMaterials(container.meshes, colors);

      // Keep the locomotion + combat clips, renamed to their state key so
      // name-matching plays exactly one; dispose the rest (the pack ships 24
      // embedded clips on one rig — we keep idle/walk/run/interact + the combat set).
      const byName = new Map(container.animationGroups.map((g) => [g.name, g]));
      const kept: AnimationGroup[] = [];
      for (const [state, clip] of [...Object.entries(LOCO_CLIPS), ...Object.entries(COMBAT_CLIPS)]) {
        const g = byName.get(clip);
        if (!g) { console.warn(`[Avatar] clip "${clip}" (${state}) missing in ${outfit.key}`); continue; }
        g.name = state;
        kept.push(g);
      }
      for (const g of container.animationGroups) { if (!kept.includes(g)) g.dispose(); }
      animationGroups = kept;
      console.warn(`[Avatar] outfit loaded: ${outfit.key} (${container.meshes.length} meshes, ${kept.length} clips)`);
    } catch (err) {
      console.warn('[Avatar] outfit load failed, using placeholder:', err);
      const placeholderBody = this.buildPlaceholderBody(appearance.bodyBase);
      this.applySkinTone(placeholderBody, colors.skin ?? DEFAULT_COLORS.skin);
      meshes.push(...placeholderBody);
    }
    /* eslint-enable no-console */

    const root = meshes[0] ?? MeshBuilder.CreateBox('char-root', { size: 0.01 }, this.scene);

    return {
      rootMesh: root,
      meshes,
      dispose: () => {
        animationGroups.forEach((g) => g.dispose());
        meshes.forEach((m) => m.dispose());
      },
      getSkeleton: () => skeleton,
      getAnimationGroups: () => animationGroups,
    };
  }

  /**
   * Tint the avatar's materials by region role: the body/suit with the skin
   * colour, eyes with the eye colour, hair/eyebrows with the hair colour.
   * (Quaternius bakes body+suit into one material, so the "skin" colour recolours
   * the whole stylized body.) See AvatarMeshCatalog.tintRoleForMaterial.
   */
  /* istanbul ignore next — browser-only material tint */
  private tintAvatarMaterials(meshes: AbstractMesh[], colors: Record<ColorKey, string>): void {
    for (const mesh of meshes) {
      const mat = mesh.material;
      if (!mat) continue;
      const role = tintRoleForMaterial(mat.name);
      if (!role) continue;
      const hex = colors[role];
      if (hex) this.tintMaterial(mat, Color3.FromHexString(hex.padEnd(7, '0')));
    }
  }

  /** Set a material's base colour, handling both PBR (albedoColor) and Standard. */
  /* istanbul ignore next — browser-only material tint */
  private tintMaterial(mat: unknown, color: Color3): void {
    if (mat && typeof mat === 'object' && 'albedoColor' in mat) {
      (mat as { albedoColor: Color3 }).albedoColor = color;
    } else if (mat instanceof StandardMaterial) {
      mat.diffuseColor = color;
    }
  }


  /** Procedural placeholder — used when GLTF files don't exist yet. */
  assemblePlaceholder(appearance: CharacterAppearance): AssembledCharacter {
    const plan = buildCharacterPlan(appearance);
    const meshes: AbstractMesh[] = [];

    const bodyMeshes = this.buildPlaceholderBody(appearance.bodyBase);
    this.applySkinTone(bodyMeshes, plan.skinTone);
    meshes.push(...bodyMeshes);

    for (const entry of plan.layers) {
      meshes.push(this.buildPlaceholderPart(entry, plan.colors));
    }

    const root = meshes[0]!;
    return {
      rootMesh: root,
      meshes,
      dispose: () => meshes.forEach((m) => m.dispose()),
    };
  }

  /** Builds one placeholder mesh for a resolved layer, named after its slot. */
  private buildPlaceholderPart(entry: SlotPlanEntry, colors: Record<ColorKey, string>): Mesh {
    const tint = entry.colorKey
      ? colors[entry.colorKey]
      : (CLOTHING_TINTS[entry.slot] ?? '#2A3A4A');

    const mat = new StandardMaterial(`${entry.slot}-mat`, this.scene);
    mat.diffuseColor = Color3.FromHexString(tint.padEnd(7, '0'));

    // Face features / facial hair → small shapes near the head.
    const face = FACE_GEOM[entry.slot];
    if (entry.category === 'face_feature' || (entry.category === 'hair_group' && entry.slot !== 'hair')) {
      const geom = face ?? { y: 1.7, d: 0.1, flatten: 0.5 };
      const mesh = MeshBuilder.CreateSphere(entry.slot, { diameter: geom.d }, this.scene);
      mesh.position = new Vector3(0, geom.y, 0.1);
      mesh.scaling.y = geom.flatten;
      mesh.material = mat;
      return mesh;
    }

    // Hair → dome over the head.
    if (entry.slot === 'hair') {
      const hair = MeshBuilder.CreateSphere('hair', { diameter: 0.27 }, this.scene);
      hair.position = new Vector3(0, 1.82, 0);
      hair.scaling.y = 0.7;
      hair.material = mat;
      return hair;
    }

    // Clothing / footwear → cylinder proxy positioned by slot.
    const geom = SLOT_GEOM[entry.slot] ?? { h: 0.4, y: 1, d: 0.4 };
    const mesh = MeshBuilder.CreateCylinder(entry.slot, { height: geom.h, diameter: geom.d }, this.scene);
    mesh.position.y = geom.y;
    mesh.material = mat;
    return mesh;
  }

  /**
   * Procedural body. Proportions vary by the body-base key so cycling the body
   * gives visible feedback even in placeholder mode (real silhouettes come from
   * the GLB). `_male_` bases are broader/taller; others are narrower.
   */
  private buildPlaceholderBody(bodyBase = ''): Mesh[] {
    const meshes: Mesh[] = [];
    // Female if it's a known `w_`-prefixed Quaternius outfit, or a legacy MakeHuman
    // `*female*` base; male otherwise. (genderOfOutfit defaults unknown keys to
    // male, so detect female explicitly and invert.)
    const female = genderOfOutfit(bodyBase) === 'female' || bodyBase.includes('female');
    const male = !female;

    const headDia = male ? 0.26 : 0.235;
    const torsoDia = male ? 0.40 : 0.30;
    const torsoH = male ? 0.64 : 0.56;
    const armDia = male ? 0.12 : 0.09;
    const armOffset = male ? 0.28 : 0.22;
    const legDia = male ? 0.15 : 0.115;
    const legOffset = male ? 0.10 : 0.085;

    const mat = new StandardMaterial('skin-mat', this.scene);
    mat.diffuseColor = new Color3(0.8, 0.7, 0.6); // neutral — overridden by applySkinTone

    // Head
    const head = MeshBuilder.CreateSphere('head', { diameter: headDia }, this.scene);
    head.position = new Vector3(0, 1.7, 0);
    head.material = mat;
    meshes.push(head);

    // Torso
    const torso = MeshBuilder.CreateCylinder('torso', { height: torsoH, diameter: torsoDia }, this.scene);
    torso.position = new Vector3(0, 1.2, 0);
    torso.material = mat;
    meshes.push(torso);

    // Arms
    ['arm_l', 'arm_r'].forEach((name, i) => {
      const arm = MeshBuilder.CreateCylinder(name, { height: 0.55, diameter: armDia }, this.scene);
      arm.position = new Vector3(i === 0 ? -armOffset : armOffset, 1.2, 0);
      arm.material = mat;
      meshes.push(arm);
    });

    // Legs
    ['leg_l', 'leg_r'].forEach((name, i) => {
      const leg = MeshBuilder.CreateCylinder(name, { height: 0.7, diameter: legDia }, this.scene);
      leg.position = new Vector3(i === 0 ? -legOffset : legOffset, 0.65, 0);
      leg.material = mat;
      meshes.push(leg);
    });

    return meshes;
  }

  private applySkinTone(meshes: AbstractMesh[], skinTone: string): void {
    meshes.forEach((m) => {
      if (m.material instanceof StandardMaterial) {
        (m.material as StandardMaterial).diffuseColor = Color3.FromHexString(
          skinTone.padEnd(7, '0')
        );
      }
    });
  }
}
