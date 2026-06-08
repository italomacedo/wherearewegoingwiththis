/**
 * Held-item attachment (Phase 10) — makes an equipped item visible on the avatar.
 *
 * The DECISION of what to render where is pure and unit-tested (`heldPropsFor`,
 * bone names, attach transforms). The actual GLB load + bone parenting is
 * browser-only (`HeldItemRig`, istanbul-ignored) following the project's
 * `await import('@babylonjs/core')` + `SceneLoader.LoadAssetContainerAsync` pattern.
 *
 * Quaternius "Ultimate Modular" rig bones (verified from the GLB node list): the
 * right hand is `Wrist.R` (there is no `Hand` bone); the upper back is `Chest`.
 */

import type { Scene, Skeleton, AbstractMesh } from '@babylonjs/core';
import {
  EquipSlot, ItemAttach, itemModelPath, itemAttach, isFirearm,
} from '@entities/items/ItemCatalog';

/** Rig bone a slot's prop attaches to (Quaternius Ultimate Modular). */
export function attachBoneNameFor(slot: EquipSlot): string {
  return slot === 'back' ? 'Chest' : 'Wrist.R';
}

/**
 * Default hand/back transform per slot when an item gives no explicit `attach`.
 * Only the prop-bearing slots (main_hand/back) need a default; armor slots
 * (head/top/bottom) swap the avatar region and carry no held prop.
 */
export const DEFAULT_ATTACH: Readonly<Partial<Record<EquipSlot, ItemAttach>>> = Object.freeze({
  main_hand: { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 },
  back: { pos: [0, -0.05, -0.12], rot: [0, 0, 0], scale: 1 },
});

/** Resolve the attach transform: the item's own override, else the slot default. */
export function resolveAttach(itemId: string, slot: EquipSlot): ItemAttach {
  return itemAttach(itemId) ?? DEFAULT_ATTACH[slot] ?? DEFAULT_ATTACH.main_hand!;
}

/**
 * Per-item attach overrides tuned in-game (the Adjust tool, persisted in the save).
 * Keyed by item id; may carry a `bone` override too.
 */
export type AttachOverrides = Record<string, ItemAttach>;

/** Attach transform honouring a save's tuned override, else item/slot defaults. */
export function resolveAttachWith(
  itemId: string, slot: EquipSlot, overrides?: AttachOverrides,
): ItemAttach {
  return overrides?.[itemId] ?? resolveAttach(itemId, slot);
}

/** The bone an item attaches to: override → item attach → slot default. */
export function boneFor(itemId: string, slot: EquipSlot, overrides?: AttachOverrides): string {
  return overrides?.[itemId]?.bone ?? itemAttach(itemId)?.bone ?? attachBoneNameFor(slot);
}

/** A prop to render on the avatar: which slot/bone, the GLB, and the transform. */
export interface HeldProp {
  slot: EquipSlot;
  itemId: string;
  modelPath: string;
  attach: ItemAttach;
  bone: string;
}

/** The visible body slots, in a stable order, that hold a prop on the avatar. */
export const VISIBLE_SLOTS: readonly EquipSlot[] = ['main_hand', 'back'];

/**
 * Pure: which props to render for an equipped-slot map. Skips empty slots and
 * model-less items (e.g. legacy pipe/bat that have no pack GLB show nothing).
 */
export function heldPropsFor(
  equipped: Partial<Record<EquipSlot, string>> | undefined,
  overrides?: AttachOverrides,
): HeldProp[] {
  const out: HeldProp[] = [];
  if (!equipped) return out;
  for (const slot of VISIBLE_SLOTS) {
    const id = equipped[slot];
    if (!id) continue;
    const modelPath = itemModelPath(id);
    if (!modelPath) continue;
    out.push({
      slot, itemId: id, modelPath,
      attach: resolveAttachWith(id, slot, overrides),
      bone: boneFor(id, slot, overrides),
    });
  }
  return out;
}

/** True when the flashlight is the held main-hand item (light on + aim pose). */
export function flashlightActive(equipped: Partial<Record<EquipSlot, string>> | undefined): boolean {
  return equipped?.main_hand === 'flashlight';
}

/** True when the held main-hand item is aimed two-handed (flashlight or a firearm). */
export function holdsAimPose(equipped: Partial<Record<EquipSlot, string>> | undefined): boolean {
  const main = equipped?.main_hand;
  return main === 'flashlight' || (!!main && isFirearm(main));
}

/**
 * The looping idle-pose clip to play while the given main-hand item is held, or null
 * for the normal empty-handed idle. A flashlight uses the aimed pose; a firearm uses
 * the relaxed gun-in-hand idle (`idle_gun`) — the aimed pose is reserved for the
 * ranged shoot animation during combat.
 */
export function idleOverrideClip(equipped: Partial<Record<EquipSlot, string>> | undefined): string | null {
  const main = equipped?.main_hand;
  if (main === 'flashlight') return 'aim';
  if (main && isFirearm(main)) return 'idle_gun';
  return null;
}

/* istanbul ignore next — entire browser rig is GPU/Electron only */
interface AttachedEntry { itemId: string; root: AbstractMesh; }

/**
 * Browser-only rig that keeps an avatar's held props in sync with its equipped
 * slots. One per avatar (player or NPC). Diff-based: only (re)loads a slot when
 * its item id changes. All methods no-op without a DOM (Jest).
 */
/* istanbul ignore next — browser/Electron only */
export class HeldItemRig {
  private scene: Scene;
  private skeleton: Skeleton | null;
  private sourceMesh: AbstractMesh | null;
  private attached = new Map<EquipSlot, AttachedEntry>();
  /** Transient prop (phone / food) shown in hand outside the slot system. */
  private transient: AbstractMesh | null = null;

  constructor(scene: Scene, skeleton: Skeleton | null, sourceMesh: AbstractMesh | null) {
    this.scene = scene;
    this.skeleton = skeleton;
    this.sourceMesh = sourceMesh;
  }

  private boneByName(name: string): unknown {
    return this.skeleton?.bones.find((b) => b.name === name) ?? null;
  }

  /** Sync all visible slots to the equipped map (diffing by item id), honouring overrides. */
  async sync(
    equipped: Partial<Record<EquipSlot, string>> | undefined,
    overrides?: AttachOverrides,
  ): Promise<void> {
    if (typeof document === 'undefined' || !this.skeleton || !this.sourceMesh) return;
    const want = new Map(heldPropsFor(equipped, overrides).map((p) => [p.slot, p]));
    // Remove slots no longer wanted, or whose item changed.
    for (const [slot, entry] of [...this.attached]) {
      const w = want.get(slot);
      if (!w || w.itemId !== entry.itemId) {
        entry.root.dispose();
        this.attached.delete(slot);
      }
    }
    // Add/replace wanted slots not already mounted.
    for (const p of want.values()) {
      if (this.attached.has(p.slot)) continue;
      await this.mount(p);
    }
  }

  private async mount(p: HeldProp): Promise<void> {
    const bone = this.boneByName(p.bone);
    if (!bone) return;
    const { SceneLoader, Vector3 } = await import('@babylonjs/core');
    let container;
    try {
      container = await SceneLoader.LoadAssetContainerAsync('/assets/', p.modelPath, this.scene);
    } catch (e) {
      console.warn(`[HeldItems] failed to load ${p.modelPath}`, e);
      return;
    }
    container.addAllToScene();
    const root = (container.meshes.find((m) => !m.parent) ?? container.meshes[0]) as AbstractMesh;
    if (!root) return;
    root.name = `held-${p.slot}-${p.itemId}`;
    root.attachToBone(bone as never, this.sourceMesh as never);
    root.position = new Vector3(p.attach.pos[0], p.attach.pos[1], p.attach.pos[2]);
    root.rotation = new Vector3(p.attach.rot[0], p.attach.rot[1], p.attach.rot[2]);
    root.scaling = new Vector3(p.attach.scale, p.attach.scale, p.attach.scale);
    this.attached.set(p.slot, { itemId: p.itemId, root });
  }

  /**
   * Live-update an already-mounted slot's transform/bone (the Adjust tool preview),
   * without reloading the GLB. No-op if that slot isn't currently mounted.
   */
  async applyLiveTransform(slot: EquipSlot, attach: ItemAttach, boneName: string): Promise<void> {
    const entry = this.attached.get(slot);
    if (!entry) return;
    const bone = this.boneByName(boneName);
    const { Vector3 } = await import('@babylonjs/core');
    if (bone) entry.root.attachToBone(bone as never, this.sourceMesh as never);
    entry.root.position = new Vector3(attach.pos[0], attach.pos[1], attach.pos[2]);
    entry.root.rotation = new Vector3(attach.rot[0], attach.rot[1], attach.rot[2]);
    entry.root.scaling = new Vector3(attach.scale, attach.scale, attach.scale);
  }

  /**
   * Show a transient prop (phone / food) in the right hand, hiding nothing
   * permanently. Pass null to clear. Used by the phone (P) and eating (10.8/10.9).
   */
  async showTransient(itemId: string | null): Promise<void> {
    if (typeof document === 'undefined' || !this.skeleton || !this.sourceMesh) return;
    this.transient?.dispose();
    this.transient = null;
    if (!itemId) return;
    const modelPath = itemModelPath(itemId);
    const bone = this.boneByName('Wrist.R');
    if (!modelPath || !bone) return;
    const { SceneLoader, Vector3 } = await import('@babylonjs/core');
    let container;
    try {
      container = await SceneLoader.LoadAssetContainerAsync('/assets/', modelPath, this.scene);
    } catch (e) {
      console.warn(`[HeldItems] failed to load transient ${modelPath}`, e);
      return;
    }
    container.addAllToScene();
    const root = (container.meshes.find((m) => !m.parent) ?? container.meshes[0]) as AbstractMesh;
    if (!root) return;
    root.name = `held-transient-${itemId}`;
    const a = resolveAttach(itemId, 'main_hand');
    root.attachToBone(bone as never, this.sourceMesh as never);
    root.position = new Vector3(a.pos[0], a.pos[1], a.pos[2]);
    root.rotation = new Vector3(a.rot[0], a.rot[1], a.rot[2]);
    root.scaling = new Vector3(a.scale, a.scale, a.scale);
    this.transient = root;
  }

  dispose(): void {
    for (const e of this.attached.values()) e.root.dispose();
    this.attached.clear();
    this.transient?.dispose();
    this.transient = null;
  }
}
