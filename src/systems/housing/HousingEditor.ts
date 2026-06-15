/* istanbul ignore file */
// Babylon/browser glue for the in-game "Home Edit Mode". All logical state lives
// in the pure, fully-tested HousingState/FurnitureCatalog; the host (GameWorldScene)
// owns the furniture meshes + credits + persistence. This file is the camera +
// gizmo + shop panel controller only — mirrors SceneEditorScene, scoped to the
// player's home furniture and operating on the LIVE interior at INTERIOR_ORIGIN.
import {
  Engine, Scene, ArcRotateCamera, Vector3, GizmoManager, TransformNode,
  KeyboardEventTypes, AbstractMesh, Node, Camera,
} from '@babylonjs/core';
import { furnitureList } from '@systems/housing/FurnitureCatalog';
import { INTERIOR_ORIGIN } from '@systems/world/InteriorRuntime';
import { t } from '@systems/I18n';

/** Side-effects the editor delegates to the scene (credits/meshes/persistence). */
export interface HousingEditorHost {
  /** Current credit balance (for the shop affordability + readout). */
  creditBalance(): number;
  /** Buy `defId`, place it at interior-local `at`, build its mesh; return the new
   *  instance key (null if unaffordable). Pays credits + persists. */
  buy(defId: string, at: [number, number, number]): Promise<string | null>;
  /** Sell the selected piece: refund + remove its mesh from the world. */
  sellSelected(): void;
  /** The world-space holder node for a placed piece (for gizmo attach + pick). */
  holderByKey(key: string): TransformNode | null;
  /** Set the HousingState selection. */
  select(key: string | null): void;
  /** The selected piece key, or null. */
  selectedKey(): string | null;
  /** Persist a piece's edited transform (gizmo drag-end) into HousingState. */
  commitTransform(key: string, transform: { position: [number, number, number]; rotationY: number; scale: number }): void;
  /** Tear down the editor: rebuild colliders/triggers from the final layout + persist. */
  onExitEditor(): void;
}

export class HousingEditor {
  private scene: Scene;
  private engine: Engine;
  private host: HousingEditorHost;

  private open = false;
  private camera: ArcRotateCamera | null = null;
  private prevCamera: Camera | null = null;
  private gizmos: GizmoManager | null = null;
  private keysDown = new Set<string>();
  private detach: (() => void) | null = null;

  // DOM UI handles (native DOM, not Babylon GUI — reliable clicks/scroll in this
  // scene where Babylon GUI input contends with the camera; Lessons 15/24).
  private dom: HTMLDivElement | null = null;
  private creditsEl: HTMLElement | null = null;
  private controlsEl: HTMLElement | null = null;

  constructor(scene: Scene, engine: Engine, host: HousingEditorHost) {
    this.scene = scene;
    this.engine = engine;
    this.host = host;
  }

  isOpen(): boolean { return this.open; }

  enter(): void {
    if (this.open || typeof document === 'undefined') return;
    this.open = true;
    const scene = this.scene;
    this.prevCamera = scene.activeCamera;

    // Edit camera: orbit around the interior origin. LEFT free for pick/gizmo.
    const [ox, , oz] = INTERIOR_ORIGIN;
    const cam = new ArcRotateCamera('housing-cam', -Math.PI / 2, Math.PI / 3.2, 22, new Vector3(ox, 1.5, oz), scene);
    cam.lowerRadiusLimit = 4;
    cam.upperRadiusLimit = 50;
    cam.lowerBetaLimit = 0.15;
    cam.upperBetaLimit = Math.PI / 2.05;
    cam.panningSensibility = 30;
    cam.panningAxis = new Vector3(1, 0, 1);
    this.camera = cam;
    scene.activeCamera = cam;
    const canvas = this.engine.getRenderingCanvas();
    // IMPORTANT: do NOT call cam.attachControl — it installs raw canvas DOM
    // listeners that steal pointer/wheel events before the GUI sees them (Lesson 32),
    // which made the shop's gallery clicks AND scrollbar dead. We drive the camera
    // ourselves and bail whenever the pointer is over a GUI panel, so the shop's
    // clicks/scroll work and the gizmo (its own utility-layer pointer handlers) keeps
    // left-drag. Middle-drag = orbit, right-drag = pan, wheel = zoom (off-panel only).
    let dragBtn = -1;
    let lastX = 0, lastY = 0;
    // These listeners are on the CANVAS only. The shop/controls are DOM elements
    // ABOVE the canvas, so clicks/wheel over them go to the DOM (native scroll +
    // button clicks) and never reach here — no panel-region guard needed.
    const onWheel = (e: WheelEvent): void => {
      const step = Math.sign(e.deltaY) * Math.max(1.5, cam.radius * 0.08);
      cam.radius = Math.min(cam.upperRadiusLimit ?? 50, Math.max(cam.lowerRadiusLimit ?? 4, cam.radius + step));
      e.preventDefault();
    };
    const onDown = (e: PointerEvent): void => {
      if (e.button === 0) {
        const util = this.gizmos?.utilityLayer?.utilityLayerScene;
        if (util && util.pick(scene.pointerX, scene.pointerY)?.hit) return; // a gizmo drag
        const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m.isPickable);
        this.host.select(this.homeKeyOf(pick?.pickedMesh ?? null));
        this.attachGizmo();
        this.refresh();
        return;
      }
      dragBtn = e.button; lastX = e.clientX; lastY = e.clientY; // 1 = orbit, 2 = pan
    };
    const onMove = (e: PointerEvent): void => {
      if (dragBtn < 0) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if (dragBtn === 1) {
        cam.alpha -= dx * 0.01;
        cam.beta = Math.min(cam.upperBetaLimit ?? Math.PI / 2.05,
          Math.max(cam.lowerBetaLimit ?? 0.15, cam.beta - dy * 0.01));
      } else {
        const fwd = cam.getTarget().subtract(cam.position); fwd.y = 0;
        const f = fwd.normalize();
        const right = new Vector3(f.z, 0, -f.x);
        const k = cam.radius * 0.0016;
        cam.target.addInPlace(right.scale(-dx * k)).addInPlace(f.scale(dy * k));
      }
    };
    const onUp = (): void => { dragBtn = -1; };
    const onCtx = (e: Event): void => e.preventDefault(); // right-drag pan w/o context menu
    canvas?.addEventListener('wheel', onWheel, { passive: false });
    canvas?.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas?.addEventListener('contextmenu', onCtx);

    const kbObs = scene.onKeyboardObservable.add((kb) => {
      const ev = kb.event as KeyboardEvent;
      if (kb.type === KeyboardEventTypes.KEYUP) { this.keysDown.delete(ev.key.toLowerCase()); return; }
      if (kb.type !== KeyboardEventTypes.KEYDOWN) return;
      this.keysDown.add(ev.key.toLowerCase());
      if (ev.key === 'Escape') this.exit();
      else if (ev.key === '1') this.setGizmoMode('move');
      else if (ev.key === '2') this.setGizmoMode('rotate');
      else if (ev.key === '3') this.setGizmoMode('scale');
      else if (ev.key === 'Delete' || ev.key === 'Backspace') this.sell();
    });
    this.detach = () => {
      canvas?.removeEventListener('wheel', onWheel);
      canvas?.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas?.removeEventListener('contextmenu', onCtx);
      scene.onKeyboardObservable.remove(kbObs);
    };

    this.setupGizmos();
    this.buildUI();
    this.attachGizmo();
    this.refresh();
  }

  /**
   * Per-frame keyboard camera navigation (driven by the scene's update loop while
   * edit mode owns the screen) — mirrors the Scene Editor: WASD/arrows pan on the
   * ground, Z/C orbit, R/F zoom. Mouse orbit (middle-drag) / pan (right-drag) /
   * wheel-zoom are the custom DOM listeners in enter() (not attachControl). `dt` is seconds.
   */
  update(dt: number): void {
    const cam = this.camera;
    if (!this.open || !cam || this.keysDown.size === 0) return;
    const fwd = cam.getTarget().subtract(cam.position);
    fwd.y = 0;
    const f = fwd.normalize();
    const right = new Vector3(f.z, 0, -f.x); // left-handed: screen-right of ground forward
    const pan = 14 * dt * Math.max(0.3, cam.radius / 22);
    const move = Vector3.Zero();
    const k = this.keysDown;
    if (k.has('w') || k.has('arrowup')) move.addInPlace(f.scale(pan));
    if (k.has('s') || k.has('arrowdown')) move.addInPlace(f.scale(-pan));
    if (k.has('d') || k.has('arrowright')) move.addInPlace(right.scale(pan));
    if (k.has('a') || k.has('arrowleft')) move.addInPlace(right.scale(-pan));
    if (move.lengthSquared() > 0) cam.target.addInPlace(move);
    if (k.has('z')) cam.alpha -= 1.6 * dt;
    if (k.has('c')) cam.alpha += 1.6 * dt;
    if (k.has('r')) cam.radius = Math.max(cam.lowerRadiusLimit ?? 4, cam.radius - 20 * dt);
    if (k.has('f')) cam.radius = Math.min(cam.upperRadiusLimit ?? 50, cam.radius + 20 * dt);
  }

  exit(): void {
    if (!this.open) return;
    this.open = false;
    this.keysDown.clear();
    this.detach?.(); this.detach = null;
    this.gizmos?.dispose(); this.gizmos = null;
    this.dom?.remove(); this.dom = null;
    this.creditsEl = null; this.controlsEl = null;
    this.camera?.dispose(); this.camera = null;
    if (this.prevCamera) this.scene.activeCamera = this.prevCamera;
    this.prevCamera = null;
    this.host.onExitEditor();
  }

  dispose(): void { this.exit(); }

  // ─── Gizmos ────────────────────────────────────────────────────────────────

  private setupGizmos(): void {
    const gm = new GizmoManager(this.scene);
    gm.usePointerToAttachGizmos = false;
    gm.positionGizmoEnabled = true;
    gm.rotationGizmoEnabled = false;
    gm.scaleGizmoEnabled = false;
    this.gizmos = gm;
    this.wireDragEnd();
  }

  private wireDragEnd(): void {
    const gm = this.gizmos;
    if (!gm) return;
    const writeBack = (): void => this.commit();
    gm.gizmos.positionGizmo?.onDragEndObservable.add(writeBack);
    gm.gizmos.rotationGizmo?.onDragEndObservable.add(writeBack);
    gm.gizmos.scaleGizmo?.onDragEndObservable.add(writeBack);
  }

  private setGizmoMode(mode: 'move' | 'rotate' | 'scale'): void {
    const gm = this.gizmos;
    if (!gm) return;
    gm.positionGizmoEnabled = mode === 'move';
    gm.rotationGizmoEnabled = mode === 'rotate';
    gm.scaleGizmoEnabled = mode === 'scale';
    this.wireDragEnd();
    this.attachGizmo();
  }

  private attachGizmo(): void {
    const key = this.host.selectedKey();
    const holder = key ? this.host.holderByKey(key) : null;
    this.gizmos?.attachToNode(holder ?? null);
  }

  /** Read the selected holder's transform back into HousingState (interior-local). */
  private commit(): void {
    const key = this.host.selectedKey();
    if (!key) return;
    const holder = this.host.holderByKey(key);
    if (!holder) return;
    const [ox, oy, oz] = INTERIOR_ORIGIN;
    this.host.commitTransform(key, {
      position: [holder.position.x - ox, holder.position.y - oy, holder.position.z - oz],
      rotationY: holder.rotation.y,
      scale: Number(holder.scaling.x.toFixed(3)),
    });
    this.refresh();
  }

  // ─── Buy / sell ──────────────────────────────────────────────────────────────

  private async buy(defId: string): Promise<void> {
    // Place at the camera's orbit target (interior-local), so it lands in view.
    const tgt = this.camera?.getTarget() ?? Vector3.Zero();
    const [ox, , oz] = INTERIOR_ORIGIN;
    const at: [number, number, number] = [tgt.x - ox, 0, tgt.z - oz];
    const key = await this.host.buy(defId, at);
    if (key) { this.attachGizmo(); this.setGizmoMode('move'); }
    this.refresh();
  }

  private sell(): void {
    if (!this.host.selectedKey()) return;
    this.host.sellSelected();
    this.gizmos?.attachToNode(null);
    this.refresh();
  }

  // ─── UI (native DOM, above the canvas) ───────────────────────────────────────

  private homeKeyOf(mesh: AbstractMesh | null): string | null {
    let node: Node | null = mesh;
    while (node) {
      const meta = (node as AbstractMesh).metadata as { homeKey?: string } | null;
      if (meta && typeof meta === 'object' && meta.homeKey) return meta.homeKey;
      node = node.parent;
    }
    return null;
  }

  /** A styled neon DOM button. */
  private mkButton(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = [
      'background:rgba(0,40,50,0.92)', 'color:#00FFCC', 'border:1px solid #0c4d57',
      'border-radius:6px', 'padding:7px 12px', 'font-family:"Courier New",monospace',
      'font-size:13px', 'cursor:pointer', 'white-space:nowrap',
    ].join(';');
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  /** Build the DOM overlay (top bar + scrollable shop + selected controls + hint).
   *  Native DOM sits ABOVE the canvas, so clicks + wheel-scroll work natively and
   *  never contend with the camera/Babylon-GUI pointer pipeline. */
  private buildUI(): void {
    const NEON = '#00FFCC', TXT = '#CFFAF0', BG = 'rgba(7,14,24,0.97)', BD = '#0c4d57';
    const wrap = document.createElement('div');
    // pointer-events:none on the wrap → only the panels (auto, below) capture; the
    // empty 3D area passes clicks/wheel through to the canvas (camera + select).
    wrap.style.cssText = ['position:fixed', 'inset:0', 'z-index:60', 'pointer-events:none',
      'font-family:"Courier New",monospace'].join(';');

    // Top bar: title · credits · DONE.
    const top = document.createElement('div');
    top.style.cssText = ['position:absolute', 'top:0', 'left:0', 'right:0', 'height:44px',
      'display:flex', 'align-items:center', 'gap:12px', 'padding:0 16px', 'box-sizing:border-box',
      `background:rgba(0,28,38,0.96)`, `border-bottom:2px solid ${NEON}`, 'pointer-events:auto'].join(';');
    const title = document.createElement('div');
    title.textContent = t('housing.title');
    title.style.cssText = [`color:${NEON}`, 'font-weight:bold', 'font-size:18px'].join(';');
    const credits = document.createElement('div');
    credits.style.cssText = [`color:${TXT}`, 'font-size:15px', 'flex:1', 'text-align:center'].join(';');
    this.creditsEl = credits;
    const done = this.mkButton(t('housing.done'), () => this.exit());
    top.append(title, credits, done);

    // Left shop panel (native scroll).
    const shop = document.createElement('div');
    shop.style.cssText = ['position:absolute', 'top:44px', 'left:0', 'width:260px', 'bottom:56px',
      `background:${BG}`, `border-right:1px solid ${BD}`, 'overflow-y:auto', 'padding:8px',
      'box-sizing:border-box', 'pointer-events:auto', 'display:flex', 'flex-direction:column', 'gap:4px'].join(';');
    const head = document.createElement('div');
    head.textContent = t('housing.shop');
    head.style.cssText = [`color:${NEON}`, 'font-size:13px', 'margin-bottom:4px'].join(';');
    shop.appendChild(head);
    for (const def of furnitureList()) {
      const label = `${t(def.nameKey)}  ${def.price}cr${def.storageCapacity ? `  [${def.storageCapacity}kg]` : ''}`;
      const b = this.mkButton(label, () => { void this.buy(def.id); });
      b.style.width = '100%';
      b.style.textAlign = 'left';
      b.style.color = TXT;
      shop.appendChild(b);
    }

    // Selected-piece controls (bottom-right): Move/Rotate/Scale/Sell.
    const controls = document.createElement('div');
    controls.style.cssText = ['position:absolute', 'right:12px', 'bottom:12px', 'display:none',
      'gap:6px', 'pointer-events:auto'].join(';');
    controls.append(
      this.mkButton(t('housing.move'), () => this.setGizmoMode('move')),
      this.mkButton(t('housing.rotate'), () => this.setGizmoMode('rotate')),
      this.mkButton(t('housing.scale'), () => this.setGizmoMode('scale')),
      this.mkButton(t('housing.sell'), () => this.sell()),
    );
    this.controlsEl = controls;

    // Hint (bottom-center, non-interactive).
    const hint = document.createElement('div');
    hint.textContent = t('housing.hint');
    hint.style.cssText = ['position:absolute', 'left:50%', 'bottom:20px', 'transform:translateX(-50%)',
      `color:${NEON}`, 'opacity:0.7', 'font-size:12px', 'pointer-events:none', 'white-space:nowrap'].join(';');

    wrap.append(top, shop, controls, hint);
    document.body.appendChild(wrap);
    this.dom = wrap;
  }

  private refresh(): void {
    if (this.creditsEl) this.creditsEl.textContent = t('housing.credits', { n: String(this.host.creditBalance()) });
    if (this.controlsEl) this.controlsEl.style.display = this.host.selectedKey() !== null ? 'flex' : 'none';
  }
}
