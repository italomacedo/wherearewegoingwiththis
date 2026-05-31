import {
  Scene, AbstractMesh, MeshBuilder, StandardMaterial,
  Color3, Vector3, Mesh,
} from '@babylonjs/core';
import type { Skeleton, AnimationGroup } from '@babylonjs/core';
import {
  CharacterAppearance, SlotId, SlotCategory, ColorKey, MorphId,
  DEFAULT_COLORS, MORPH_REGISTRY, resolveLayers, getSkinTone, clampMorph,
} from '@entities/CharacterData';
import { CharacterAssets, resolveAssetPath, resolveBasePath, mapMorphName, diffMorphCoverage, diffSkeletonBones, ANIMATION_KEYS } from '@assets/AssetManifest';

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

  /* istanbul ignore next — browser/Electron only; exercised via manual verification (phase 6) */
  private async assembleGltf(appearance: CharacterAppearance): Promise<AssembledCharacter> {
    const { SceneLoader } = await import('@babylonjs/core');
    await import('@babylonjs/loaders/glTF'); // registers the .glb/.gltf loader plugin
    const plan = buildCharacterPlan(appearance);
    const meshes: AbstractMesh[] = [];

    let skeleton: Skeleton | null = null;
    let animationGroups: AnimationGroup[] = [];
    // morph-target lookup by resolved glTF name, for live slider updates
    const morphByName = new Map<string, { influence: number }>();

    // ─── Base body (carries the skeleton, morph targets, animations) ──────────
    try {
      const container = await SceneLoader.LoadAssetContainerAsync('/assets/', plan.basePath, this.scene);
      container.addAllToScene();
      meshes.push(...container.meshes);
      skeleton = container.skeletons[0] ?? null;
      animationGroups = container.animationGroups;

      // Mixamo-rigged exports face +Z (our world "forward" at rotation.y=0), so
      // the model's facing matches PlayerController's `root.rotation.y = facing`
      // with no baked offset. (The creator camera is positioned to look at this
      // front — see CharacterCreatorScene.setupCamera.) Do NOT rotate here, or the
      // hero walks backwards ("moonwalk"). A base that faces -Z would need π here.

      // Collect morph targets from any mesh that has a manager.
      const available: string[] = [];
      for (const mesh of container.meshes) {
        const mgr = (mesh as { morphTargetManager?: { numTargets: number; getTarget(i: number): { name: string; influence: number } } }).morphTargetManager;
        if (!mgr) continue;
        for (let i = 0; i < mgr.numTargets; i++) {
          const t = mgr.getTarget(i);
          morphByName.set(t.name, t);
          available.push(t.name);
        }
      }
      // Dev verification: dump what the GLB actually contains so we can filter
      // stray meshes (e.g. MPFB helper geometry) and tune MORPH_TARGET_NAMES.
      /* eslint-disable no-console */
      const meshNames = container.meshes.map((m) => m.name).filter((n) => n && n !== '__root__');
      console.warn('[Avatar] GLB meshes:', meshNames.join(', ') || '(none)');
      console.warn(
        `[Avatar] GLB morph targets (${available.length}):`,
        available.length ? available.join(', ') : '(none — export has no shape keys)',
      );
      const coverage = diffMorphCoverage(available);
      if (coverage.unusedTargets.length > 0) {
        console.warn('[Avatar] GLB targets with no matching slider:', coverage.unusedTargets.join(', '));
      }
      if (coverage.unmappedSliders.length > 0) {
        console.warn('[Avatar] unmapped morph sliders:', coverage.unmappedSliders.join(', '));
      }
      /* eslint-enable no-console */

      // Apply the planned morph weights to their matching targets.
      for (const { name, weight } of resolveMorphInfluences(plan.morphs, available)) {
        const target = morphByName.get(name);
        if (target) target.influence = weight;
      }

      this.applySkinTexture(container.meshes, plan);
    } catch {
      // Base GLB missing — fall back to placeholder body.
      const placeholderBody = this.buildPlaceholderBody(appearance.bodyBase);
      this.applySkinTone(placeholderBody, plan.skinTone);
      meshes.push(...placeholderBody);
    }

    // ─── Shared locomotion clips (separate Mixamo GLBs, retargeted to the rig) ─
    // Dedicated clip files take precedence over any animations embedded in the
    // base GLB; if none are present we keep whatever the base shipped.
    if (skeleton) {
      const clips = await this.loadAnimationClips(skeleton);
      if (clips.length) {
        animationGroups.forEach((g) => g.dispose());
        animationGroups = clips;
      }
    }

    // ─── Attached layers (clothing/hair/etc.), sharing the base skeleton ──────
    // In real-GLB mode a missing part is SKIPPED (not replaced by a floating
    // placeholder proxy) so the loaded model stays clean.
    for (const entry of plan.layers) {
      if (!entry.manifestPath) continue;
      try {
        const part = await SceneLoader.LoadAssetContainerAsync('/assets/', entry.manifestPath, this.scene);
        part.addAllToScene();
        for (const m of part.meshes) {
          if (skeleton) m.skeleton = skeleton; // share rig so one animation drives all
          this.applyPartTint(m, entry, plan.colors);
          meshes.push(m);
        }
      } catch {
        // part GLB missing/unreachable — skip it (no placeholder in GLB mode)
      }
    }

    const root = meshes[0] ?? MeshBuilder.CreateBox('char-root', { size: 0.01 }, this.scene);

    return {
      rootMesh: root,
      meshes,
      dispose: () => {
        animationGroups.forEach((g) => g.dispose());
        meshes.forEach((m) => m.dispose());
      },
      setMorph: (morphId: MorphId, weight: number) => {
        const name = mapMorphName(morphId, [...morphByName.keys()]);
        const target = name ? morphByName.get(name) : undefined;
        if (target) target.influence = clampMorph(weight);
      },
      getSkeleton: () => skeleton,
      getAnimationGroups: () => animationGroups,
    };
  }

  /**
   * Loads the shared locomotion clips (idle/walk/run/interact) from separate
   * GLBs and retargets each onto the base skeleton by bone name, renaming the
   * group to its manifest key so PlayerController's name-matching playback
   * (`g.name.includes(state)`) drives it. Missing clip files are skipped, and a
   * clip whose bones don't match the rig is reported (diffSkeletonBones).
   */
  /* istanbul ignore next — browser/Electron only; exercised via manual verification */
  private async loadAnimationClips(skeleton: Skeleton): Promise<AnimationGroup[]> {
    const { SceneLoader } = await import('@babylonjs/core');
    await import('@babylonjs/loaders/glTF');
    const out: AnimationGroup[] = [];

    // Drive the base skeleton's transform nodes, looked up by lowercased bone name.
    const boneNodeByName = new Map<string, unknown>();
    for (const bone of skeleton.bones) {
      boneNodeByName.set(bone.name.toLowerCase(), bone.getTransformNode() ?? bone);
    }
    const baseBoneNames = skeleton.bones.map((b) => b.name);

    /* eslint-disable no-console */
    for (const key of ANIMATION_KEYS) {
      const path = CharacterAssets.animations[key];
      try {
        const c = await SceneLoader.LoadAssetContainerAsync('/assets/', path, this.scene);
        const animBoneNames = (c.skeletons[0]?.bones ?? []).map((b) => b.name);
        const report = diffSkeletonBones(baseBoneNames, animBoneNames);
        if (report.missing.length) {
          console.warn(`[Avatar] anim "${key}" has bones absent from the base rig:`, report.missing.join(', '));
        }
        for (const g of c.animationGroups) {
          out.push(g.clone(key, (oldTarget) => {
            const name = (oldTarget as { name?: string })?.name?.toLowerCase();
            return (name && boneNodeByName.get(name)) || oldTarget;
          }));
        }
        // Keep the cloned groups; drop the source container's groups/skeleton/meshes.
        c.animationGroups.forEach((g) => g.dispose());
        c.skeletons.forEach((s) => s.dispose());
        c.meshes.forEach((m) => m.dispose());
        console.warn(`[Avatar] loaded anim clip "${key}" (${path})`);
      } catch {
        // Clip GLB missing/unreachable — that state just won't be animated.
      }
    }
    /* eslint-enable no-console */
    return out;
  }

  /* istanbul ignore next — browser-only material/texture wiring */
  private applySkinTexture(meshes: AbstractMesh[], plan: CharacterPlan): void {
    const color = Color3.FromHexString(plan.skinTone.padEnd(7, '0'));
    for (const mesh of meshes) {
      const mat = mesh.material as (StandardMaterial & { albedoColor?: Color3 }) | null;
      if (!mat) continue;
      if ('albedoColor' in mat) {
        mat.albedoColor = color;           // glTF PBRMaterial
      } else if (mat instanceof StandardMaterial) {
        mat.diffuseColor = color;
      }
    }
    // Skin-texture PNG swap + makeup compositing deferred until those PNGs exist
    // (plan.skinTexturePath / plan.makeup).
  }

  /* istanbul ignore next — browser-only material tint */
  private applyPartTint(mesh: AbstractMesh, entry: SlotPlanEntry, colors: Record<ColorKey, string>): void {
    const hex = entry.colorKey ? colors[entry.colorKey] : (CLOTHING_TINTS[entry.slot] ?? null);
    if (hex && mesh.material instanceof StandardMaterial) {
      mesh.material.diffuseColor = Color3.FromHexString(hex.padEnd(7, '0'));
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
    const male = bodyBase.includes('_male_');

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
