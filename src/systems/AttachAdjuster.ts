/**
 * Pure calibration model for the in-game "Adjust" tool (Phase 10.4b).
 *
 * Holds a working `ItemAttach` (pos/rot/scale + bone) for one item and exposes
 * pure operations the browser overlay drives: select a field, nudge it, cycle the
 * attach bone. No engine — fully unit-tested; the overlay applies `value()` to the
 * live HeldItemRig and persists it into the save's attach overrides.
 */

import type { ItemAttach } from '@entities/items/ItemCatalog';

export type AttachField = 'posX' | 'posY' | 'posZ' | 'rotX' | 'rotY' | 'rotZ' | 'scale';
export const ATTACH_FIELDS: readonly AttachField[] = ['posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ', 'scale'];

/** Nudge step sizes. */
export const POS_STEP = 0.02;            // metres
export const ROT_STEP = Math.PI / 24;    // 7.5°
export const SCALE_STEP = 0.02;          // additive
export const MIN_SCALE = 0.005;

function clone(a: ItemAttach): ItemAttach {
  return { pos: [...a.pos] as [number, number, number], rot: [...a.rot] as [number, number, number], scale: a.scale, bone: a.bone };
}

export class AttachAdjuster {
  readonly itemId: string;
  private work: ItemAttach;
  private bones: string[];
  private fieldIdx = 0;
  private boneIdx = 0;

  constructor(itemId: string, base: ItemAttach, bones: string[] = []) {
    this.itemId = itemId;
    this.work = clone(base);
    this.bones = bones;
    if (this.work.bone) {
      const i = bones.indexOf(this.work.bone);
      this.boneIdx = i >= 0 ? i : 0;
    }
    if (bones.length && !this.work.bone) this.work.bone = bones[0];
  }

  field(): AttachField { return ATTACH_FIELDS[this.fieldIdx]; }

  /** Cycle the selected field (wraps). */
  cycleField(dir: number): void {
    const n = ATTACH_FIELDS.length;
    this.fieldIdx = ((this.fieldIdx + Math.sign(dir)) % n + n) % n;
  }

  /** Nudge the selected field by one step in `dir` (±1). Scale clamps at MIN_SCALE. */
  nudge(dir: number): void {
    const s = Math.sign(dir);
    switch (this.field()) {
      case 'posX': this.work.pos[0] += s * POS_STEP; break;
      case 'posY': this.work.pos[1] += s * POS_STEP; break;
      case 'posZ': this.work.pos[2] += s * POS_STEP; break;
      case 'rotX': this.work.rot[0] += s * ROT_STEP; break;
      case 'rotY': this.work.rot[1] += s * ROT_STEP; break;
      case 'rotZ': this.work.rot[2] += s * ROT_STEP; break;
      case 'scale': this.work.scale = Math.max(MIN_SCALE, this.work.scale + s * SCALE_STEP); break;
    }
  }

  /** Cycle the attach bone among the available rig bones (wraps). No-op if none. */
  cycleBone(dir: number): void {
    if (this.bones.length === 0) return;
    const n = this.bones.length;
    this.boneIdx = ((this.boneIdx + Math.sign(dir)) % n + n) % n;
    this.work.bone = this.bones[this.boneIdx];
  }

  bone(): string | undefined { return this.work.bone; }

  /** A defensive clone of the working transform (what gets applied + persisted). */
  value(): ItemAttach { return clone(this.work); }

  /** One-line readout for the overlay HUD. */
  summary(): string {
    const f = (n: number) => n.toFixed(2);
    const deg = (r: number) => Math.round((r * 180) / Math.PI);
    return [
      `pos [${f(this.work.pos[0])}, ${f(this.work.pos[1])}, ${f(this.work.pos[2])}]`,
      `rot [${deg(this.work.rot[0])}, ${deg(this.work.rot[1])}, ${deg(this.work.rot[2])}]`,
      `scale ${f(this.work.scale)}`,
      `bone ${this.work.bone ?? '(default)'}`,
      `▶ ${this.field()}`,
    ].join('  |  ');
  }
}
