import {
  Scene, TransformNode, Vector3, MeshBuilder, StandardMaterial, Color3, Mesh, VertexData,
} from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Rectangle } from '@babylonjs/gui';
import type { ItemAttach } from '@entities/items/ItemCatalog';
import type { MinimapView } from '@systems/MinimapModel';
import { MINIMAP_SIZE_PX } from '@systems/MinimapModel';

/**
 * In-car cockpit: a low-poly dashboard + aircraft-style control yoke and an LCD
 * screen, built as ONE unit (`cockpit-root`) parented to the vehicle's VISUAL pivot
 * (so it yaws with the car). The whole unit is positioned by `COCKPIT_TRANSFORM`
 * (calibrated live via the Adjust tool, then baked here). The LCD shows placeholder
 * text now; `setLcdText` is the seam a future "car agent" (Claude) will drive.
 *
 * Pure layout + helpers are unit-tested; the Babylon mesh/GUI build is browser-only
 * (`typeof document` guard + istanbul-ignored), mirroring VehicleController.
 */

export interface PropTransform {
  pos: [number, number, number];
  rot: [number, number, number];
  scale: number;
}

/**
 * Transform of the whole cockpit unit relative to the vehicle visual pivot —
 * calibrated with the Adjust tool (id `cockpit`) and baked here. The yoke sits at
 * the cockpit-root origin (where the driver's hands rest); rot is a forward rake.
 */
export const COCKPIT_TRANSFORM: PropTransform = {
  pos: [-0.64, 0.92, 0.2], // calibrated via the Adjust tool (O in car)
  rot: [0, 0, 0],
  scale: 1,
};

/**
 * Internal prop offsets relative to cockpit-root (yoke at the origin = the driver's
 * hands, on the LEFT). The dashboard is shifted to +X (driver's right) so the yoke
 * sits at its left edge, and the LCD occupies the dashboard's centre→right.
 */
export const COCKPIT_LAYOUT: Readonly<Record<'dashboard' | 'column' | 'yoke' | 'lcd', PropTransform>> = Object.freeze({
  yoke:      { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 },
  // Column reaches forward from the yoke (driver's hands, x=0) into the dashboard.
  column:    { pos: [0, 0.02, 0.18], rot: [Math.PI / 2, 0, 0], scale: 1 },
  // Dashboard is a truncated pyramid (frustum): its LARGE base (near, vertical, at
  // local z=0) faces the driver and backs the LCD; it tapers up+forward to a SMALL
  // base that meets the windshield's lower edge. Placed so the large base sits at
  // z=0.26 (just behind the LCD at 0.255).
  dashboard: { pos: [0.52, -0.02, 0.26], rot: [0, 0, 0], scale: 1 },
  lcd:       { pos: [0.62, -0.02, 0.255], rot: [0, Math.PI, 0], scale: 1 },
});

/**
 * Dashboard frustum (truncated pyramid) dimensions, in cockpit-local units. The
 * NEAR (large) base is the vertical driver-facing face at local z=0 (backs the LCD);
 * the FAR (small) base is `depth` forward and `rise` up — tuned to meet the lower
 * edge of the windshield. Adjust these to align the small base to the glass.
 */
export const DASH_FRUSTUM = Object.freeze({
  nearWidth: 1.5, nearHeight: 0.42,
  farWidth: 0.85, farHeight: 0.1,
  depth: 0.5, rise: 0.03,
});

/** FP camera local position on the visual pivot (driver head). Behind the yoke
 *  (−Z is rearward; the car faces +Z), tuned for the in-cabin view. */
export const DRIVER_HEAD_OFFSET = new Vector3(-0.4, 1.15, -0.65);

/** Extra vertical lift (units) applied to the resolved driver head on mount. */
export const DRIVER_HEAD_RAISE = 0.25;

/** Downward tilt (radians) of the in-car camera so the driver sees the road. */
export const DRIVER_HEAD_PITCH_DOWN = (10 * Math.PI) / 180;

/** Placeholder banner shown on the LCD (Roxane, the car agent, overrides via setLcdText). */
export const LCD_BANNER = 'NETRUNNER OS v2.077  ·  ROXANE: STANDBY';

/** Number of vertical bars in the dashboard voice waveform (Roxane). */
export const WAVEFORM_BARS = 28;

/* istanbul ignore next — browser/Electron only; verified via manual playtest */
export class VehicleCockpit {
  private scene: Scene;
  private root: TransformNode | null = null;
  private lcdTexture: AdvancedDynamicTexture | null = null;
  private bannerBlock: TextBlock | null = null;
  private waveBars: Rectangle[] = [];
  private waveStrip: Rectangle | null = null;
  private mapCells: Rectangle[] = [];
  private mapDots: Rectangle[] = [];
  private mapNorth: TextBlock | null = null;
  private built = false;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  isBuilt(): boolean {
    return this.built;
  }

  getHeadOffset(): Vector3 {
    return DRIVER_HEAD_OFFSET.clone();
  }

  /** Build the cockpit (one unit) as a child of the vehicle visual pivot. Idempotent. */
  build(parent: TransformNode): void {
    if (this.built || typeof document === 'undefined') return;

    const root = new TransformNode('cockpit-root', this.scene);
    root.parent = parent;
    root.position = new Vector3(COCKPIT_TRANSFORM.pos[0], COCKPIT_TRANSFORM.pos[1], COCKPIT_TRANSFORM.pos[2]);
    root.rotation = new Vector3(COCKPIT_TRANSFORM.rot[0], COCKPIT_TRANSFORM.rot[1], COCKPIT_TRANSFORM.rot[2]);
    this.root = root;

    const mat = (name: string, diffuse: Color3, emissive: Color3): StandardMaterial => {
      const m = new StandardMaterial(name, this.scene);
      m.diffuseColor = diffuse;
      m.emissiveColor = emissive;
      m.specularColor = Color3.Black();
      return m;
    };
    const place = (node: AbstractMesh | TransformNode, t: PropTransform): void => {
      node.position = new Vector3(t.pos[0], t.pos[1], t.pos[2]);
      node.rotation = new Vector3(t.rot[0], t.rot[1], t.rot[2]);
      node.scaling = new Vector3(t.scale, t.scale, t.scale);
    };

    // Grey display bezel; matte-black yoke (no glow).
    const panelMat = mat('cockpit-panel-mat', new Color3(0.32, 0.32, 0.35), new Color3(0.06, 0.06, 0.07));
    const yokeMat = mat('cockpit-yoke-mat', new Color3(0.02, 0.02, 0.02), Color3.Black());

    // Dashboard: a truncated pyramid whose large base hosts the LCD (driver-facing)
    // and whose small base meets the windshield's lower edge.
    panelMat.backFaceCulling = false; // double-sided so the frustum reads solid
    const dash = this.buildDashFrustum('cockpit-dash');
    dash.material = panelMat;
    dash.parent = root;
    place(dash, COCKPIT_LAYOUT.dashboard);

    // Steering column (yoke shaft) from the dashboard toward the pilot.
    const column = MeshBuilder.CreateCylinder('cockpit-column', { diameter: 0.05, height: 0.4 }, this.scene);
    column.material = mat('cockpit-column-mat', new Color3(0.1, 0.1, 0.12), Color3.Black());
    column.parent = root;
    place(column, COCKPIT_LAYOUT.column);

    // Aircraft-style yoke (two-handed control wheel): hub + horizontal crossbar +
    // two upward grips. Static — it does not roll with steer (owner's call).
    const yoke = new TransformNode('cockpit-yoke', this.scene);
    yoke.parent = root;
    place(yoke, COCKPIT_LAYOUT.yoke);
    const hub = MeshBuilder.CreateBox('cockpit-yoke-hub', { width: 0.12, height: 0.1, depth: 0.07 }, this.scene);
    hub.material = yokeMat;
    hub.parent = yoke;
    const bar = MeshBuilder.CreateBox('cockpit-yoke-bar', { width: 0.2, height: 0.05, depth: 0.05 }, this.scene);
    bar.material = yokeMat;
    bar.parent = yoke;
    [-1, 1].forEach((side) => {
      // Each horn: a vertical grip rising from the crossbar end, angled slightly in.
      const grip = MeshBuilder.CreateCylinder(`cockpit-yoke-grip-${side}`, { diameter: 0.05, height: 0.18 }, this.scene);
      grip.material = yokeMat;
      grip.parent = yoke;
      grip.position = new Vector3(side * 0.07, 0.08, 0);
      grip.rotation.z = -side * 0.18;
      const cap = MeshBuilder.CreateBox(`cockpit-yoke-cap-${side}`, { width: 0.07, height: 0.05, depth: 0.07 }, this.scene);
      cap.material = yokeMat;
      cap.parent = yoke;
      cap.position = new Vector3(side * 0.07, 0, 0); // outer end of the crossbar
    });

    // LCD: a big screen filling the dashboard's driver-facing face.
    const lcd = MeshBuilder.CreatePlane('cockpit-lcd', { width: 0.9, height: 0.38 }, this.scene);
    place(lcd, COCKPIT_LAYOUT.lcd);
    lcd.parent = root;
    const tex = AdvancedDynamicTexture.CreateForMesh(lcd, 900, 380); // ~2.37:1 to match the plane
    // The screen faces the driver via the plane's rot [0,π,0], which mirrors the
    // texture horizontally — cancel it by flipping the U so the text reads normally.
    tex.uScale = -1;
    tex.uOffset = 1;
    this.lcdTexture = tex;
    const bg = new Rectangle('cockpit-lcd-bg');
    bg.background = '#02120c'; // phosphor-green-black
    bg.thickness = 0;
    bg.width = 1;
    bg.height = 1;
    tex.addControl(bg);

    // Banner (the future car-agent message line).
    const banner = new TextBlock('cockpit-lcd-banner', LCD_BANNER);
    banner.color = '#33FF99';
    banner.fontFamily = '"Courier New", monospace';
    banner.fontSize = 30;
    banner.textHorizontalAlignment = 0; // LEFT
    banner.textVerticalAlignment = 0;   // TOP
    banner.horizontalAlignment = 0;     // LEFT
    banner.left = '24px';
    banner.top = '14px';
    bg.addControl(banner);
    this.bannerBlock = banner;

    // ── Minimap (heading-up) on the LEFT of the LCD (in the camera frame) ──
    // A clipped square holds a pool of themed tile cells + NPC dots; the car
    // marker stays centred (always points up) and an "N" rides the ring. All
    // driven per-frame by setMinimap(); see MinimapModel for the pure math.
    const map = new Rectangle('cockpit-minimap');
    map.horizontalAlignment = 0; map.verticalAlignment = 0;
    map.left = '28px'; map.top = '56px';
    map.width = `${MINIMAP_SIZE_PX}px`; map.height = `${MINIMAP_SIZE_PX}px`;
    map.background = '#031a10'; map.color = '#1f7a55'; map.thickness = 2;
    map.clipChildren = true;
    bg.addControl(map);

    // Tile-cell pool — enough for a (2·span+1)² block (span ≈ 3 → 49). Hidden
    // until setMinimap fills them.
    for (let i = 0; i < 49; i++) {
      const cell = new Rectangle(`cockpit-map-cell-${i}`);
      cell.horizontalAlignment = 2; cell.verticalAlignment = 2; // CENTER
      cell.thickness = 0; cell.isVisible = false;
      map.addControl(cell);
      this.mapCells.push(cell);
    }
    // NPC dot pool (drawn over the cells).
    for (let i = 0; i < 24; i++) {
      const dot = new Rectangle(`cockpit-map-dot-${i}`);
      dot.horizontalAlignment = 2; dot.verticalAlignment = 2;
      dot.width = '7px'; dot.height = '7px'; dot.cornerRadius = 4;
      dot.thickness = 0; dot.isVisible = false;
      map.addControl(dot);
      this.mapDots.push(dot);
    }
    // North marker on the ring.
    const north = new TextBlock('cockpit-map-north', 'N');
    north.color = '#FFCC33';
    north.fontFamily = '"Courier New", monospace';
    north.fontSize = 22; north.fontStyle = 'bold';
    north.horizontalAlignment = 2; north.verticalAlignment = 2;
    north.width = '20px'; north.height = '20px';
    map.addControl(north);
    this.mapNorth = north;
    // Car marker — centred, always pointing up.
    const car = new TextBlock('cockpit-map-car', '▲');
    car.color = '#33E0FF';
    car.fontFamily = '"Courier New", monospace';
    car.fontSize = 22;
    car.horizontalAlignment = 2; car.verticalAlignment = 2;
    map.addControl(car);

    // Voice waveform strip (Roxane): a row of centre-anchored bars across the
    // bottom-left of the LCD. A container centres each bar so a level grows both
    // up and down (symmetric scope look). Visible ONLY during a Roxane chat
    // (setWaveformVisible); heights are driven by setWaveform.
    const stripW = 900 - (28 + MINIMAP_SIZE_PX + 24) - 24; // right of the map, to the edge
    const strip = new Rectangle('cockpit-wave-strip');
    strip.horizontalAlignment = 0; strip.verticalAlignment = 0;
    strip.left = `${28 + MINIMAP_SIZE_PX + 24}px`; strip.top = '92px';
    strip.width = `${stripW}px`; strip.height = '190px';
    strip.thickness = 0; strip.background = 'transparent';
    strip.isVisible = false;
    bg.addControl(strip);
    this.waveStrip = strip;
    const slot = stripW / WAVEFORM_BARS;
    for (let i = 0; i < WAVEFORM_BARS; i++) {
      const bar = new Rectangle(`cockpit-wave-${i}`);
      bar.horizontalAlignment = 0; // LEFT
      bar.verticalAlignment = 2;   // CENTER (symmetric growth)
      bar.left = `${Math.round(i * slot)}px`;
      bar.width = `${Math.max(2, Math.round(slot * 0.55))}px`;
      bar.height = '2px';
      bar.background = '#33FF99'; bar.thickness = 0;
      strip.addControl(bar);
      this.waveBars.push(bar);
    }

    this.built = true;
  }

  /**
   * Build the dashboard frustum mesh (truncated pyramid). Large base at local z=0
   * (vertical, driver-facing — backs the LCD), tapering up+forward to a small base
   * at z=`depth`, y+`rise`. Double-sided material handles winding.
   */
  private buildDashFrustum(name: string): Mesh {
    const f = DASH_FRUSTUM;
    const wl = f.nearWidth / 2, hl = f.nearHeight / 2, ws = f.farWidth / 2, hs = f.farHeight / 2;
    const d = f.depth, r = f.rise;
    const positions = [
      -wl, -hl, 0, wl, -hl, 0, wl, hl, 0, -wl, hl, 0, // near (large) 0..3
      -ws, r - hs, d, ws, r - hs, d, ws, r + hs, d, -ws, r + hs, d, // far (small) 4..7
    ];
    const indices = [
      0, 1, 2, 0, 2, 3, // near
      4, 6, 5, 4, 7, 6, // far
      0, 4, 5, 0, 5, 1, // bottom
      3, 2, 6, 3, 6, 7, // top
      0, 3, 7, 0, 7, 4, // left
      1, 5, 6, 1, 6, 2, // right
    ];
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    const mesh = new Mesh(name, this.scene);
    vd.applyToMesh(mesh);
    return mesh;
  }

  /** Apply a calibrated (Adjust tool) transform to the whole cockpit unit. */
  applyCockpitOverride(attach: ItemAttach): void {
    if (!this.root || typeof document === 'undefined') return;
    this.root.position = new Vector3(attach.pos[0], attach.pos[1], attach.pos[2]);
    this.root.rotation = new Vector3(attach.rot[0], attach.rot[1], attach.rot[2]);
    this.root.scaling = new Vector3(attach.scale, attach.scale, attach.scale);
  }

  /** Set the LCD banner line (future car-agent message). No-op headless. */
  setLcdText(text: string): void {
    if (this.bannerBlock) this.bannerBlock.text = text;
  }

  /**
   * Drive the voice waveform bars (each level 0..1). Extra/short level arrays are
   * tolerated (missing bars rest flat). Max bar height ~150px (the strip is 190).
   * No-op headless.
   */
  setWaveform(levels: number[]): void {
    const MAX_PX = 150;
    for (let i = 0; i < this.waveBars.length; i++) {
      const lvl = Math.max(0, Math.min(1, levels[i] ?? 0));
      this.waveBars[i]!.height = `${Math.max(2, Math.round(lvl * MAX_PX))}px`;
    }
  }

  /** Rest the waveform to a thin flat line (Roxane silent). No-op headless. */
  setWaveformIdle(): void {
    for (const bar of this.waveBars) bar.height = '2px';
  }

  /** Show/hide the whole waveform strip (only during a Roxane chat). No-op headless. */
  setWaveformVisible(visible: boolean): void {
    if (this.waveStrip) this.waveStrip.isVisible = visible;
  }

  /** Convert an RGB tint (0..1) to a hex colour string. */
  private static rgbToHex([r, g, b]: [number, number, number]): string {
    const to = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
  }

  /** Drive the heading-up minimap from a pure MinimapView. No-op headless. */
  setMinimap(view: MinimapView): void {
    for (let i = 0; i < this.mapCells.length; i++) {
      const cell = this.mapCells[i]!;
      const c = view.cells[i];
      if (!c) { cell.isVisible = false; continue; }
      cell.isVisible = true;
      cell.left = `${Math.round(c.dx)}px`;
      cell.top = `${Math.round(c.dy)}px`;
      const s = `${Math.max(1, Math.round(c.sizePx))}px`;
      cell.width = s; cell.height = s;
      cell.rotation = view.rotation;
      cell.background = VehicleCockpit.rgbToHex(c.color);
    }
    for (let i = 0; i < this.mapDots.length; i++) {
      const dot = this.mapDots[i]!;
      const d = view.dots[i];
      if (!d) { dot.isVisible = false; continue; }
      dot.isVisible = true;
      dot.left = `${Math.round(d.dx)}px`;
      dot.top = `${Math.round(d.dy)}px`;
      dot.background = d.dead ? '#8a3b3b' : '#FF4D6D';
    }
    if (this.mapNorth) {
      this.mapNorth.left = `${Math.round(view.north.dx)}px`;
      this.mapNorth.top = `${Math.round(view.north.dy)}px`;
    }
  }

  dispose(): void {
    this.lcdTexture?.dispose(); // not a scene-graph child of the pivot — dispose explicitly
    this.lcdTexture = null;
    this.bannerBlock = null;
    this.waveBars = [];
    this.waveStrip = null;
    this.mapCells = [];
    this.mapDots = [];
    this.mapNorth = null;
    this.root?.dispose(false, true); // dispose the cockpit subtree + its materials
    this.root = null;
    this.built = false;
  }
}
