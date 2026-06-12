/* istanbul ignore file */
// Babylon/browser glue; the editor's logic lives in the pure, fully-tested
// EditorState/SceneDoc/GalleryManifest/NpcRandomizer modules.
/**
 * SceneEditorScene — WYSIWYG editor for authored scenes (quadrants/interiors).
 *
 * Camera: ArcRotateCamera with LEFT button detached (reserved for pick/gizmo);
 * orbit on middle, pan on right. Selection: own scene.pick on left pointerdown
 * → holder named `ed:<kind>:<key>` → EditorState.select + gizmo attach. Gizmo
 * drag-end writes the holder transform back into the doc (1/2/3 toggle move/
 * rotate/scale). Del deletes, Ctrl+D duplicates, ESC (×2 when dirty) → menu.
 */
import {
  Engine, Color4, Color3, ArcRotateCamera, Vector3, HemisphericLight,
  MeshBuilder, StandardMaterial, TransformNode, GizmoManager,
  KeyboardEventTypes, AbstractMesh, Node, Scene,
} from '@babylonjs/core';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';
import { t } from '@systems/I18n';
import { AssetCache, babylonContainerLoader } from '@systems/world/AssetCache';
import { framePlanes, crosswalkStripes } from '@assets/world/CityFrame';
import { EditorState } from '@systems/sceneeditor/EditorState';
import { EditorPanels } from '@systems/sceneeditor/EditorPanels';
import { parseGalleryManifest, type GalleryEntry } from '@systems/sceneeditor/GalleryManifest';
import { SceneDoc, SceneKind, QUADRANT_BAND, INTERIOR_BAND } from '@systems/sceneeditor/SceneDoc';
import { loadAllSceneDocs, writeSceneDoc } from '@systems/world/SceneDocSource';
import { randomNpc } from '@systems/sceneeditor/NpcRandomizer';
import { OUTFITS } from '@assets/AvatarMeshCatalog';
import { itemModelPath } from '@entities/items/ItemCatalog';
import type { AttributeId } from '@entities/CharacterStats';
import type { NPCDisposition, NPCMood } from '@entities/NPCAgent';

const GROUND_PRESETS: Array<[number, number, number]> = [
  [0.18, 0.18, 0.21], // asphalt grey
  [0.16, 0.22, 0.16], // park green
  [0.25, 0.22, 0.16], // desert sand
  [0.13, 0.16, 0.22], // night blue
  [0.22, 0.16, 0.20], // neon mauve
];

const MOOD_CYCLE: NPCMood[] = ['neutral', 'friendly', 'suspicious', 'hostile', 'scared'];
const DISP_CYCLE: NPCDisposition[] = ['neutral', 'friendly', 'wary', 'hostile'];

export class SceneEditorScene extends BaseScene {
  private state = new EditorState();
  private camera: ArcRotateCamera | null = null;
  /** Keys currently held (keyboard navigation: pan/orbit/zoom). */
  private keysDown = new Set<string>();
  /** Removes the canvas DOM nav listeners (wheel/auxclick). */
  private detachNav: (() => void) | null = null;
  private panels: EditorPanels | null = null;
  private cache: AssetCache | null = null;
  private gizmos: GizmoManager | null = null;
  private holders = new Map<string, TransformNode>();
  private groundNodes: TransformNode | null = null;
  private docs: SceneDoc[] = [];
  private escArmedAt = 0;
  private syncSeq = 0;
  private rng: () => number = Math.random;

  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0.01, 0.02, 0.05, 1);
  }

  async onEnter(): Promise<void> {
    const scene = this.babylonScene;
    // Camera FIRST (Lesson 3): free orbit around the scene origin.
    const camera = new ArcRotateCamera('editor-cam', -Math.PI / 2, Math.PI / 3.2, 55, Vector3.Zero(), scene);
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 160;
    camera.lowerBetaLimit = 0.15;
    camera.upperBetaLimit = Math.PI / 2.05; // never below the ground plane
    camera.wheelDeltaPercentage = 0.03; // wheel = zoom
    camera.panningSensibility = 25; // RIGHT-drag = pan (lower = faster)
    camera.panningAxis = new Vector3(1, 0, 1); // pan slides on the ground plane
    this.camera = camera;
    scene.activeCamera = camera;
    if (typeof document !== 'undefined') {
      // (noPreventDefault=false, useCtrlForPanning=false, panningMouseButton=2 → RIGHT-drag pans.)
      camera.attachControl(false, false, 2);
      // LEFT button stays free for pick/gizmo: orbit on MIDDLE, pan on RIGHT.
      const pointers = camera.inputs.attached.pointers as unknown as { buttons: number[] } | undefined;
      if (pointers) pointers.buttons = [1, 2];
      // Wheel zoom via a raw DOM listener — Babylon's mousewheel input doesn't
      // fire reliably in the Electron canvas (same approach as CameraSystem).
      camera.inputs.removeByType('ArcRotateCameraMouseWheelInput');
      const canvas = this.engine.getRenderingCanvas();
      if (canvas) {
        const onWheel = (e: WheelEvent): void => {
          const step = Math.sign(e.deltaY) * Math.max(2, camera.radius * 0.08);
          camera.radius = Math.min(camera.upperRadiusLimit ?? 160,
            Math.max(camera.lowerRadiusLimit ?? 5, camera.radius + step));
          e.preventDefault();
        };
        const onAux = (e: MouseEvent): void => {
          if (e.button === 1) e.preventDefault(); // suppress middle-click autoscroll
        };
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('auxclick', onAux);
        this.detachNav = () => {
          canvas.removeEventListener('wheel', onWheel);
          canvas.removeEventListener('auxclick', onAux);
        };
      }
    }

    const ambient = new HemisphericLight('editor-light', new Vector3(0.2, 1, 0.3), scene);
    ambient.intensity = 0.95;
    ambient.groundColor = new Color3(0.25, 0.28, 0.32);

    if (typeof document === 'undefined') return;

    this.cache = new AssetCache(babylonContainerLoader(scene));
    this.state.newDoc('untitled', 'quadrant');
    this.buildGround();

    this.panels = new EditorPanels(this.state, this.buildHandlers());
    this.panels.build(scene);
    this.panels.setStatus(t('editor.hint'));

    this.setupGizmos(scene);
    this.setupPick(scene);
    this.setupKeys(scene);

    void this.loadCatalogs();
  }

  async onExit(): Promise<void> {
    this.keysDown.clear();
    this.detachNav?.();
    this.detachNav = null;
    this.panels?.dispose();
    this.panels = null;
    this.gizmos?.dispose();
    this.gizmos = null;
    this.holders.clear();
    this.cache?.clear();
  }

  // ─── Boot data ─────────────────────────────────────────────────────────────

  private async loadCatalogs(): Promise<void> {
    try {
      const res = await fetch('/assets/gallery_manifest.json');
      const entries = res.ok ? parseGalleryManifest(await res.json()) : [];
      this.panels?.setEntries(entries);
    } catch { this.panels?.setEntries([]); }
    await this.refreshSceneList();
  }

  private async refreshSceneList(): Promise<void> {
    this.docs = await loadAllSceneDocs();
    this.panels?.setSceneIds(this.docs.map((d) => d.id));
  }

  // ─── Ground / frame ────────────────────────────────────────────────────────

  private buildGround(): void {
    const scene = this.babylonScene;
    this.groundNodes?.dispose();
    const root = new TransformNode('editor-ground', scene);
    this.groundNodes = root;
    const tint = this.state.doc.ground ?? GROUND_PRESETS[0];

    const mat = (name: string, c: [number, number, number], emissive = false): StandardMaterial => {
      const m = new StandardMaterial(name, scene);
      m.diffuseColor = new Color3(...c);
      m.specularColor = Color3.Black();
      if (emissive) m.emissiveColor = new Color3(...c);
      return m;
    };

    if (this.state.doc.kind === 'quadrant') {
      // The CityFrame stack at tile (0,0) → local == world coordinates.
      const kinds: Record<string, [number, number, number]> = {
        asphalt: [0.16, 0.16, 0.18],
        sidewalk: [0.28, 0.28, 0.3],
        interior: tint,
      };
      for (const plane of framePlanes(0, 0)) {
        const g = MeshBuilder.CreateGround(plane.key, { width: plane.size[0], height: plane.size[1] }, scene);
        g.position.set(plane.center[0], plane.center[1], plane.center[2]);
        g.material = mat(`${plane.key}-mat`, kinds[plane.kind]);
        g.isPickable = false;
        g.parent = root;
      }
      for (const stripe of crosswalkStripes(0, 0)) {
        const s = MeshBuilder.CreateGround(stripe.key, { width: stripe.size[0], height: stripe.size[1] }, scene);
        s.position.set(stripe.center[0], stripe.center[1] + 0.01, stripe.center[2]);
        s.material = mat(`${stripe.key}-mat`, [0.5, 0.5, 0.5], true);
        s.isPickable = false;
        s.parent = root;
      }
      // Authorable-band outline (|x|,|z| ≤ 22): thin emissive frame.
      const b = QUADRANT_BAND;
      const lineMat = mat('band-mat', [0, 0.6, 0.5], true);
      const mkLine = (key: string, w: number, d: number, x: number, z: number): void => {
        const l = MeshBuilder.CreateGround(key, { width: w, height: d }, scene);
        l.position.set(x, 0.06, z);
        l.material = lineMat;
        l.isPickable = false;
        l.parent = root;
      };
      mkLine('band-n', b * 2, 0.15, 0, b);
      mkLine('band-s', b * 2, 0.15, 0, -b);
      mkLine('band-e', 0.15, b * 2, b, 0);
      mkLine('band-w', 0.15, b * 2, -b, 0);
    } else {
      const g = MeshBuilder.CreateGround('editor-room', { width: 60, height: 60 }, scene);
      g.material = mat('editor-room-mat', tint);
      g.isPickable = false;
      g.parent = root;
      const grid = mat('editor-grid-mat', [0.1, 0.3, 0.28], true);
      for (let i = -30; i <= 30; i += 6) {
        const lx = MeshBuilder.CreateGround(`grid-x-${i}`, { width: 0.06, height: 60 }, scene);
        lx.position.set(i, 0.02, 0);
        lx.material = grid;
        lx.isPickable = false;
        lx.parent = root;
        const lz = MeshBuilder.CreateGround(`grid-z-${i}`, { width: 60, height: 0.06 }, scene);
        lz.position.set(0, 0.02, i);
        lz.material = grid;
        lz.isPickable = false;
        lz.parent = root;
      }
    }
  }

  // ─── Visual sync (doc → holders) ───────────────────────────────────────────

  private holderKey(kind: string, key: string | number): string {
    return `ed:${kind}:${key}`;
  }

  private async syncVisuals(): Promise<void> {
    const scene = this.babylonScene;
    const seq = ++this.syncSeq;
    const wanted = new Set<string>();
    const doc = this.state.doc;
    doc.props.forEach((p) => wanted.add(this.holderKey('prop', p.key)));
    doc.items.forEach((_, i) => wanted.add(this.holderKey('item', i)));
    doc.npcs.forEach((n) => wanted.add(this.holderKey('npc', n.id)));
    doc.doorTriggers.forEach((d) => wanted.add(this.holderKey('door', d.key)));

    // Remove orphans (also when a delete/load swapped the doc).
    for (const [key, node] of [...this.holders]) {
      if (!wanted.has(key)) {
        node.dispose();
        this.holders.delete(key);
      }
    }

    // Items re-key by index — simplest correct approach is rebuild-on-structural
    // change, handled by the orphan sweep above + creation below.
    for (const p of doc.props) {
      const key = this.holderKey('prop', p.key);
      let holder = this.holders.get(key);
      if (!holder) {
        holder = new TransformNode(key, scene);
        this.holders.set(key, holder);
        const inst = await this.cache!.instantiate(p.model, scene);
        if (seq !== this.syncSeq) { return; }
        if (inst) {
          inst.animationGroups.forEach((g) => g.stop());
          inst.rootNodes.forEach((n) => { (n as TransformNode).parent = holder!; });
          this.markPickable(holder, key);
        } else {
          this.fallbackBox(holder, key, [0.9, 0.2, 0.9]);
        }
      }
      holder.position.set(p.position[0], p.position[1], p.position[2]);
      holder.rotation.y = p.rotationY ?? 0;
      const s = p.scale ?? 1;
      if (typeof s === 'number') holder.scaling.setAll(s);
      else holder.scaling.set(s[0], s[1], s[2]);
    }

    for (let i = 0; i < doc.items.length; i++) {
      const item = doc.items[i];
      const key = this.holderKey('item', i);
      let holder = this.holders.get(key);
      if (!holder) {
        holder = new TransformNode(key, scene);
        this.holders.set(key, holder);
        const model = itemModelPath(item.itemId);
        const inst = model ? await this.cache!.instantiate(model, scene) : null;
        if (seq !== this.syncSeq) { return; }
        if (inst) {
          inst.animationGroups.forEach((g) => g.stop());
          inst.rootNodes.forEach((n) => { (n as TransformNode).parent = holder!; });
          this.normalizeToSize(holder, 0.6);
          this.markPickable(holder, key);
        } else {
          this.fallbackBox(holder, key, [0, 0.9, 0.7]);
        }
      }
      holder.position.set(item.position[0], item.position[1] + 0.3, item.position[2]);
    }

    for (const npc of doc.npcs) {
      const key = this.holderKey('npc', npc.id);
      let holder = this.holders.get(key);
      const outfitPath = OUTFITS.find((o) => o.key === npc.outfit)?.path;
      const wantedModel = `npc-model:${npc.outfit}`;
      if (holder && holder.metadata !== wantedModel) {
        holder.dispose();
        this.holders.delete(key);
        holder = undefined;
      }
      if (!holder) {
        holder = new TransformNode(key, scene);
        holder.metadata = wantedModel;
        this.holders.set(key, holder);
        const inst = outfitPath ? await this.cache!.instantiate(outfitPath, scene) : null;
        if (seq !== this.syncSeq) { return; }
        if (inst) {
          inst.animationGroups.forEach((g) => g.stop());
          const idle = inst.animationGroups.find((g) => /idle/i.test(g.name));
          idle?.start(true);
          inst.rootNodes.forEach((n) => { (n as TransformNode).parent = holder!; });
          this.markPickable(holder, key);
        } else {
          this.fallbackBox(holder, key, [0.9, 0.5, 0]);
        }
      }
      holder.position.set(npc.position[0], npc.position[1], npc.position[2]);
      holder.rotation.y = npc.rotationY ?? 0;
    }

    for (const door of doc.doorTriggers) {
      const key = this.holderKey('door', door.key);
      let holder = this.holders.get(key);
      if (!holder) {
        holder = new TransformNode(key, scene);
        this.holders.set(key, holder);
      }
      // Door volumes re-mesh every sync (size can change).
      holder.getChildMeshes().forEach((m) => m.dispose());
      const box = MeshBuilder.CreateBox(`${key}-vol`, {
        width: door.size[0], height: door.size[1], depth: door.size[2],
      }, scene);
      const mat = new StandardMaterial(`${key}-mat`, scene);
      mat.diffuseColor = new Color3(0, 0.9, 0.7);
      mat.emissiveColor = new Color3(0, 0.5, 0.4);
      mat.alpha = 0.35;
      box.material = mat;
      box.parent = holder;
      box.position.y = door.size[1] / 2;
      this.markPickable(holder, key);
      holder.position.set(door.position[0], door.position[1], door.position[2]);
    }

    this.panels?.refresh();
    this.reattachGizmo();
  }

  private markPickable(holder: TransformNode, key: string): void {
    holder.getChildMeshes().forEach((m) => {
      m.isPickable = true;
      m.alwaysSelectAsActiveMesh = true;
      m.metadata = { editorKey: key };
    });
  }

  private fallbackBox(holder: TransformNode, key: string, color: [number, number, number]): void {
    const box = MeshBuilder.CreateBox(`${key}-fb`, { size: 0.8 }, this.babylonScene);
    const mat = new StandardMaterial(`${key}-fb-mat`, this.babylonScene);
    mat.emissiveColor = new Color3(...color);
    box.material = mat;
    box.parent = holder;
    box.position.y = 0.4;
    this.markPickable(holder, key);
  }

  /** Scale an imported item model so its largest extent ≈ size metres. */
  private normalizeToSize(holder: TransformNode, size: number): void {
    const { min, max } = holder.getHierarchyBoundingVectors(true);
    const ext = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
    if (Number.isFinite(ext) && ext > 0.001) {
      const f = size / ext;
      holder.getChildren().forEach((c) => {
        if (c instanceof TransformNode) c.scaling.scaleInPlace(f);
      });
    }
  }

  // ─── Gizmos / picking / keys ───────────────────────────────────────────────

  private setupGizmos(scene: Scene): void {
    const gm = new GizmoManager(scene);
    gm.usePointerToAttachGizmos = false;
    gm.positionGizmoEnabled = true;
    gm.rotationGizmoEnabled = false;
    gm.scaleGizmoEnabled = false;
    this.gizmos = gm;
    this.wireGizmoDragEnd();
  }

  private wireGizmoDragEnd(): void {
    const gm = this.gizmos;
    if (!gm) return;
    const writeBack = (): void => this.commitHolderTransform();
    gm.gizmos.positionGizmo?.onDragEndObservable.add(writeBack);
    gm.gizmos.rotationGizmo?.onDragEndObservable.add(writeBack);
    gm.gizmos.scaleGizmo?.onDragEndObservable.add(writeBack);
  }

  private setGizmoMode(mode: 'move' | 'rotate' | 'scale'): void {
    const gm = this.gizmos;
    if (!gm) return;
    const sel = this.state.selection;
    gm.positionGizmoEnabled = mode === 'move';
    // Rotation/scale only make sense for props (and rotation for NPCs).
    gm.rotationGizmoEnabled = mode === 'rotate' && (sel?.kind === 'prop' || sel?.kind === 'npc');
    gm.scaleGizmoEnabled = mode === 'scale' && sel?.kind === 'prop';
    this.wireGizmoDragEnd();
    this.reattachGizmo();
  }

  private selectedHolder(): TransformNode | null {
    const sel = this.state.selection;
    if (!sel) return null;
    if (sel.kind === 'prop') return this.holders.get(this.holderKey('prop', sel.key)) ?? null;
    if (sel.kind === 'item') return this.holders.get(this.holderKey('item', sel.index)) ?? null;
    if (sel.kind === 'npc') return this.holders.get(this.holderKey('npc', sel.id)) ?? null;
    return this.holders.get(this.holderKey('door', sel.key)) ?? null;
  }

  private reattachGizmo(): void {
    const holder = this.selectedHolder();
    this.gizmos?.attachToNode(holder);
  }

  private commitHolderTransform(): void {
    const holder = this.selectedHolder();
    if (!holder) return;
    const sel = this.state.selection;
    const pos: [number, number, number] = [holder.position.x, holder.position.y, holder.position.z];
    // Items sit raised for display; store the ground position.
    if (sel?.kind === 'item') pos[1] = Math.max(0, holder.position.y - 0.3);
    const sx = holder.scaling.x, sy = holder.scaling.y, sz = holder.scaling.z;
    const uniform = Math.abs(sx - sy) < 1e-3 && Math.abs(sy - sz) < 1e-3;
    this.state.setTransform({
      position: pos,
      rotationY: holder.rotation.y,
      scale: uniform ? Number(sx.toFixed(3)) : [sx, sy, sz],
    });
    this.panels?.refresh();
  }

  private setupPick(scene: Scene): void {
    // Lesson 32: with the ArcRotateCamera attached, scene.onPointerObservable
    // never delivers the left click — listen on the canvas DOM directly.
    const canvas = this.engine.getRenderingCanvas();
    if (!canvas) return;
    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      const x = scene.pointerX;
      const y = scene.pointerY;
      if (this.isOverPanel(x, y)) return; // GUI paints on the same canvas
      const pick = scene.pick(x, y, (m) => m.isPickable);
      const key = this.editorKeyOf(pick?.pickedMesh ?? null);
      if (!key) return;
      const [, kind, id] = key.split(':');
      if (kind === 'prop') this.state.select({ kind: 'prop', key: id });
      else if (kind === 'item') this.state.select({ kind: 'item', index: Number(id) });
      else if (kind === 'npc') this.state.select({ kind: 'npc', id });
      else if (kind === 'door') this.state.select({ kind: 'door', key: id });
      this.panels?.refresh();
      this.reattachGizmo();
    };
    canvas.addEventListener('pointerdown', onDown);
    const prevDetach = this.detachNav;
    this.detachNav = () => {
      prevDetach?.();
      canvas.removeEventListener('pointerdown', onDown);
    };
  }

  /** Is the pointer over the toolbar / gallery / properties panel regions? */
  private isOverPanel(x: number, y: number): boolean {
    const w = this.engine.getRenderWidth();
    if (y <= 48) return true; // toolbar strip
    if (x <= 262) return true; // left gallery panel (6 + 250 + margin)
    if (x >= w - 262) return true; // right properties panel
    return false;
  }

  private editorKeyOf(mesh: AbstractMesh | null): string | null {
    let node: Node | null = mesh;
    while (node) {
      const meta = (node as AbstractMesh).metadata as { editorKey?: string } | string | null;
      if (meta && typeof meta === 'object' && meta.editorKey) return meta.editorKey;
      if (typeof node.name === 'string' && node.name.startsWith('ed:')) return node.name;
      node = node.parent;
    }
    return null;
  }

  /** Keyboard navigation each frame: WASD/arrows pan, Z/C orbit, R/F zoom. */
  update(): void {
    const cam = this.camera;
    if (!cam || typeof document === 'undefined') return;
    const dt = Math.min(0.1, this.engine.getDeltaTime() / 1000);
    const k = this.keysDown;
    if (k.size === 0) return;
    // Camera-relative ground pan (W = away from the camera), scaled by zoom.
    const fwd = cam.getTarget().subtract(cam.position);
    fwd.y = 0;
    const f = fwd.normalize();
    // Babylon is left-handed: screen-right of a ground forward f is (f.z, 0, -f.x).
    const right = new Vector3(f.z, 0, -f.x);
    const pan = 28 * dt * Math.max(0.3, cam.radius / 55);
    const move = Vector3.Zero();
    if (k.has('w') || k.has('arrowup')) move.addInPlace(f.scale(pan));
    if (k.has('s') || k.has('arrowdown')) move.addInPlace(f.scale(-pan));
    if (k.has('d') || k.has('arrowright')) move.addInPlace(right.scale(pan));
    if (k.has('a') || k.has('arrowleft')) move.addInPlace(right.scale(-pan));
    if (move.lengthSquared() > 0) cam.target.addInPlace(move);
    if (k.has('z')) cam.alpha -= 1.6 * dt;
    if (k.has('c')) cam.alpha += 1.6 * dt;
    if (k.has('r')) cam.radius = Math.max(cam.lowerRadiusLimit ?? 5, cam.radius - 40 * dt);
    if (k.has('f')) cam.radius = Math.min(cam.upperRadiusLimit ?? 160, cam.radius + 40 * dt);
  }

  private setupKeys(scene: Scene): void {
    scene.onKeyboardObservable.add((kb) => {
      const ev = kb.event as KeyboardEvent;
      if (kb.type === KeyboardEventTypes.KEYUP) {
        this.keysDown.delete(ev.key.toLowerCase());
        return;
      }
      if (kb.type !== KeyboardEventTypes.KEYDOWN) return;
      if (!ev.ctrlKey && !ev.altKey && !ev.metaKey) this.keysDown.add(ev.key.toLowerCase());
      // DOM inputs stopPropagation their own keydowns; anything here is world input.
      if (ev.key === 'Escape') {
        this.onEsc();
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (this.state.deleteSelected()) void this.syncVisuals();
      } else if ((ev.key === 'd' || ev.key === 'D') && ev.ctrlKey) {
        ev.preventDefault();
        if (this.state.duplicateSelected()) void this.syncVisuals();
      } else if (ev.key === '1') {
        this.setGizmoMode('move');
      } else if (ev.key === '2') {
        this.setGizmoMode('rotate');
      } else if (ev.key === '3') {
        this.setGizmoMode('scale');
      }
    });
  }

  private onEsc(): void {
    const now = Date.now();
    if (this.state.dirty && now - this.escArmedAt > 3000) {
      this.escArmedAt = now;
      this.panels?.setStatus('Unsaved changes — ESC again to leave / ESC de novo para sair');
      return;
    }
    const sm = ServiceLocator.get<SceneManager>('sceneManager');
    void sm.loadScene('main-menu');
  }

  // ─── Panel handlers ────────────────────────────────────────────────────────

  private spawnPos(): [number, number, number] {
    // Where the camera is looking (its orbit target), clamped to the scene's
    // authorable band, on the ground — so new objects appear in view.
    const band = this.state.doc.kind === 'quadrant' ? QUADRANT_BAND : INTERIOR_BAND;
    const t = this.camera?.getTarget();
    const clamp = (v: number): number => Math.max(-band, Math.min(band, v));
    return t ? [clamp(t.x), 0, clamp(t.z)] : [0, 0, 0];
  }

  private buildHandlers(): import('@systems/sceneeditor/EditorPanels').EditorPanelHandlers {
    return {
      onNew: (kind: SceneKind) => {
        this.state.newDoc('untitled', kind);
        this.buildGround();
        void this.syncVisuals();
      },
      onSave: () => { void this.save(); },
      onLoad: (sceneId: string) => {
        const doc = this.docs.find((d) => d.id === sceneId);
        if (!doc) return;
        this.state.loadDoc(JSON.parse(JSON.stringify(doc)) as SceneDoc);
        this.buildGround();
        void this.syncVisuals();
      },
      onGalleryPick: (entry: GalleryEntry) => {
        this.state.addProp(entry.path, this.spawnPos());
        void this.syncVisuals();
      },
      onItemPick: (itemId: string) => {
        this.state.addItem(itemId, this.spawnPos());
        void this.syncVisuals();
      },
      onGenerateNpc: () => {
        this.state.addNpc(randomNpc(this.rng, this.spawnPos()));
        void this.syncVisuals();
      },
      onAddDoor: () => {
        this.state.addDoor(this.spawnPos());
        void this.syncVisuals();
      },
      onTransformNudge: (field, delta) => {
        const tr = this.state.selectedTransform();
        if (!tr) return;
        if (field === 'rot') {
          this.state.setTransform({ rotationY: tr.rotationY + delta });
        } else if (field === 'scale') {
          const s = typeof tr.scale === 'number' ? tr.scale : tr.scale[0];
          this.state.setTransform({ scale: Math.max(0.05, Number((s + delta).toFixed(2))) });
        } else {
          const i = field === 'px' ? 0 : field === 'py' ? 1 : 2;
          const pos: [number, number, number] = [...tr.position];
          pos[i] += delta;
          if (i === 1) pos[1] = Math.max(0, pos[1]);
          this.state.setTransform({ position: pos });
        }
        void this.syncVisuals();
      },
      onSolidToggle: () => {
        const prop = this.state.selectedProp();
        if (prop) this.state.setPropSolid(!prop.solid);
        this.panels?.refresh();
      },
      onNpcOutfitCycle: (dir) => {
        const npc = this.state.selectedNpc();
        if (!npc) return;
        const idx = OUTFITS.findIndex((o) => o.key === npc.outfit);
        const next = OUTFITS[(idx + dir + OUTFITS.length) % OUTFITS.length];
        this.state.setNpcField({ outfit: next.key });
        void this.syncVisuals();
      },
      onNpcMoodCycle: () => {
        const npc = this.state.selectedNpc();
        if (!npc) return;
        const next = MOOD_CYCLE[(MOOD_CYCLE.indexOf(npc.defaultMood) + 1) % MOOD_CYCLE.length];
        this.state.setNpcField({ defaultMood: next });
        this.panels?.refresh();
      },
      onNpcDispositionCycle: () => {
        const npc = this.state.selectedNpc();
        if (!npc) return;
        const next = DISP_CYCLE[(DISP_CYCLE.indexOf(npc.initialDisposition) + 1) % DISP_CYCLE.length];
        this.state.setNpcField({ initialDisposition: next });
        this.panels?.refresh();
      },
      onNpcAttrNudge: (attr: AttributeId, delta: number) => {
        const npc = this.state.selectedNpc();
        if (!npc) return;
        const attrs = { ...(npc.attributes ?? {}) };
        attrs[attr] = Math.min(100, Math.max(5, (attrs[attr] ?? 20) + delta));
        this.state.setNpcField({ attributes: attrs });
        this.panels?.refresh();
      },
      onNpcNameEdit: (name: string) => {
        this.state.setNpcField({ name });
        this.panels?.refresh();
      },
      onDoorTargetCycle: (dir) => {
        const door = this.state.selectedDoor();
        if (!door) return;
        const targets = ['', ...this.docs.map((d) => d.id).filter((id) => id !== this.state.doc.id)];
        const idx = Math.max(0, targets.indexOf(door.targetSceneId));
        const next = targets[(idx + dir + targets.length) % targets.length];
        this.state.setDoorTarget(next);
        this.panels?.refresh();
      },
      onDoorSizeNudge: (axis, delta) => {
        const door = this.state.selectedDoor();
        if (!door) return;
        const size: [number, number, number] = [...door.size];
        size[axis] = Math.max(0.5, size[axis] + delta);
        this.state.setDoorSize(size);
        void this.syncVisuals();
      },
      onDoorSpawnNudge: (axis, delta) => {
        const door = this.state.selectedDoor();
        if (!door) return;
        const sp: [number, number, number] = [...door.spawnPoint];
        sp[axis] += delta;
        this.state.setDoorTarget(door.targetSceneId, sp);
        this.panels?.refresh();
      },
      onGroundCycle: () => {
        const cur = this.state.doc.ground;
        const idx = GROUND_PRESETS.findIndex((g) => cur && g[0] === cur[0] && g[1] === cur[1] && g[2] === cur[2]);
        this.state.setGround(GROUND_PRESETS[(idx + 1) % GROUND_PRESETS.length]);
        this.buildGround();
        this.panels?.refresh();
      },
      onDelete: () => {
        if (this.state.deleteSelected()) void this.syncVisuals();
      },
      onDuplicate: () => {
        if (this.state.duplicateSelected()) void this.syncVisuals();
      },
    };
  }

  private async save(): Promise<void> {
    const ok = await writeSceneDoc(this.state.toJSON());
    if (ok) {
      this.state.markSaved();
      this.panels?.setStatus(t('editor.saved'));
      await this.refreshSceneList();
    } else {
      this.panels?.setStatus(t('editor.saveFailed'));
    }
    this.panels?.refresh();
  }
}
