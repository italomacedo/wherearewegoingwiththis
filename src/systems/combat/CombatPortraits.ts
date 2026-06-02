/* istanbul ignore file -- 100% browser-only 3D subprojection + GUI; no headless-testable logic */
/**
 * Baldur's-Gate-style combat portraits: one small 3D "subprojection" per combatant
 * along the top of the screen, in initiative order, with a neon turn-marker on the
 * active fighter. Implemented as per-combatant cameras rendered into a small top
 * viewport (a 3D subprojection of each fighter's head), composited by Babylon over
 * the main view; the name labels + turn marker are GUI controls.
 *
 * Entirely browser-only (cameras/viewports/GUI) — the ordering/active-turn data
 * comes from the pure CombatController, so there is nothing headless-testable here.
 */

import { Scene, Camera, UniversalCamera, Vector3, Viewport, TransformNode, AbstractMesh } from '@babylonjs/core';
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from '@babylonjs/gui';

export interface PortraitEntry {
  id: string;
  name: string;
  head: TransformNode | AbstractMesh;
}

const W = 0.13;   // portrait width  (normalized viewport)
const H = 0.20;   // portrait height
const GAP = 0.02;
const TOP_MARGIN = 0.02;

export class CombatPortraits {
  private readonly scene: Scene;
  private cams: Array<{ id: string; cam: Camera }> = [];
  private labels = new Map<string, TextBlock>();
  private marker: Rectangle | null = null;
  private mainCamera: Camera | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** Build a portrait camera + label per combatant (initiative order) and a turn marker. */
  build(entries: PortraitEntry[], gui: AdvancedDynamicTexture): void {
    if (entries.length === 0) return;
    this.dispose();
    this.mainCamera = this.scene.activeCamera;
    if (!this.mainCamera) return;
    this.mainCamera.viewport = new Viewport(0, 0, 1, 1);

    const n = entries.length;
    const totalW = n * W + (n - 1) * GAP;
    let left = 0.5 - totalW / 2;
    const bottom = 1 - H - TOP_MARGIN; // viewport y is bottom-up → top strip

    const active: Camera[] = [this.mainCamera];
    entries.forEach((e) => {
      const headPos = e.head.getAbsolutePosition().add(new Vector3(0, 1.6, 0));
      const cam = new UniversalCamera(`portrait-${e.id}`, headPos.add(new Vector3(0, 0.05, 1.35)), this.scene);
      cam.setTarget(headPos); // avatars face +Z → look back at the face
      cam.fov = 0.6;
      cam.minZ = 0.05;
      cam.layerMask = this.mainCamera!.layerMask;
      cam.viewport = new Viewport(left, bottom, W, H);
      cam.inputs.clear(); // a static portrait camera — no user input
      active.push(cam);
      this.cams.push({ id: e.id, cam });

      const label = new TextBlock(`portrait-label-${e.id}`, e.name);
      label.color = '#9AB';
      label.fontSize = 12;
      label.fontFamily = '"Courier New", monospace';
      label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      label.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      label.width = `${W * 100}%`;
      label.height = '18px';
      label.left = `${left * 100}%`;
      label.top = `${(TOP_MARGIN + H) * 100}%`;
      gui.addControl(label);
      this.labels.set(e.id, label);

      left += W + GAP;
    });

    const marker = new Rectangle('portrait-marker');
    marker.thickness = 3;
    marker.color = '#00FFCC';
    marker.background = '';
    marker.cornerRadius = 4;
    marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    marker.isVisible = false;
    gui.addControl(marker);
    this.marker = marker;

    // Keep the main camera as the singular activeCamera + pointer camera so the
    // fullscreen combat GUI keeps receiving clicks (multi-activeCameras otherwise
    // strands GUI pointer picking).
    this.scene.activeCameras = active;
    this.scene.activeCamera = this.mainCamera;
    this.scene.cameraToUseForPointers = this.mainCamera;
  }

  /** Highlight the active combatant's portrait (turn marker + label colour). */
  setActive(id: string): void {
    if (!this.marker) return;
    const found = this.cams.find((c) => c.id === id);
    if (!found) { this.marker.isVisible = false; return; }
    const vp = found.cam.viewport;
    this.marker.isVisible = true;
    this.marker.width = `${vp.width * 100}%`;
    this.marker.height = `${vp.height * 100}%`;
    this.marker.left = `${vp.x * 100}%`;
    this.marker.top = `${(1 - vp.y - vp.height) * 100}%`; // viewport bottom-up → GUI top-down
    this.labels.forEach((l, lid) => { l.color = lid === id ? '#00FFCC' : '#9AB'; });
  }

  dispose(): void {
    this.scene.cameraToUseForPointers = null;
    if (this.mainCamera) {
      this.scene.activeCameras = null;
      this.scene.activeCamera = this.mainCamera;
      this.mainCamera.viewport = new Viewport(0, 0, 1, 1);
    }
    this.cams.forEach((c) => c.cam.dispose());
    this.cams = [];
    this.labels.forEach((l) => l.dispose());
    this.labels.clear();
    this.marker?.dispose();
    this.marker = null;
  }
}
