import {
  Scene, TransformNode, Vector3, MeshBuilder, StandardMaterial, Color3,
} from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Rectangle } from '@babylonjs/gui';
import type { ItemAttach } from '@entities/items/ItemCatalog';

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
  column:    { pos: [0, 0.02, 0.16], rot: [Math.PI / 2, 0, 0], scale: 1 },
  // Lowered vertical panel; the LCD is a big screen on its driver-facing face.
  // rot [0, π, 0] turns the screen's front toward the driver so text reads upright
  // (the old [π,0,0] flipped it upside-down + mirrored).
  dashboard: { pos: [0.95, -0.02, 0.3], rot: [0, 0, 0], scale: 1 },
  lcd:       { pos: [0.95, -0.02, 0.255], rot: [0, Math.PI, 0], scale: 1 },
});

/** FP camera local position on the visual pivot (driver head). Behind the yoke
 *  (−Z is rearward; the car faces +Z), tuned for the in-cabin view. */
export const DRIVER_HEAD_OFFSET = new Vector3(-0.4, 1.15, -0.65);

/** Placeholder banner shown on the LCD (future Claude car-agent overrides via setLcdText). */
export const LCD_BANNER = 'NETRUNNER OS v2.077  ·  CAR AGENT: STANDBY';

/** Gauge fills (0..100%) for the LCD bars: speed, altitude and hull condition. */
export function gaugePercents(
  speed: number, maxSpeed: number, altitude: number, maxAltitude: number, healthFrac: number,
): { spd: number; alt: number; hull: number } {
  const pct = (v: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (Math.abs(v) / max) * 100)) : 0);
  return {
    spd: pct(speed, maxSpeed),
    alt: pct(altitude, maxAltitude),
    hull: Math.max(0, Math.min(100, healthFrac * 100)),
  };
}

/* istanbul ignore next — browser/Electron only; verified via manual playtest */
export class VehicleCockpit {
  private scene: Scene;
  private root: TransformNode | null = null;
  private lcdTexture: AdvancedDynamicTexture | null = null;
  private bannerBlock: TextBlock | null = null;
  private spdFill: Rectangle | null = null;
  private altFill: Rectangle | null = null;
  private hullFill: Rectangle | null = null;
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

    // Dashboard: a vertical panel that hosts a big LCD on its driver-facing face.
    const dash = MeshBuilder.CreateBox('cockpit-dash', { width: 1.2, height: 0.36, depth: 0.08 }, this.scene);
    dash.material = panelMat;
    dash.parent = root;
    place(dash, COCKPIT_LAYOUT.dashboard);

    // Steering column (yoke shaft) from the dashboard toward the pilot.
    const column = MeshBuilder.CreateCylinder('cockpit-column', { diameter: 0.05, height: 0.3 }, this.scene);
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
    const lcd = MeshBuilder.CreatePlane('cockpit-lcd', { width: 1.12, height: 0.32 }, this.scene);
    place(lcd, COCKPIT_LAYOUT.lcd);
    lcd.parent = root;
    const tex = AdvancedDynamicTexture.CreateForMesh(lcd, 896, 256); // ~3.5:1 to match the plane
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

    // Three phosphor gauges (speed / altitude / hull) as progress bars.
    const gauge = (label: string, topPx: number): Rectangle => {
      const lbl = new TextBlock(`cockpit-gauge-${label}`, label);
      lbl.color = '#33FF99';
      lbl.fontFamily = '"Courier New", monospace';
      lbl.fontSize = 28;
      lbl.horizontalAlignment = 0; lbl.textHorizontalAlignment = 0;
      lbl.verticalAlignment = 0; lbl.textVerticalAlignment = 0;
      lbl.left = '24px'; lbl.top = `${topPx}px`;
      lbl.width = '120px'; lbl.height = '30px';
      bg.addControl(lbl);
      const track = new Rectangle(`cockpit-track-${label}`);
      track.horizontalAlignment = 0; track.verticalAlignment = 0;
      track.left = '150px'; track.top = `${topPx}px`;
      track.width = '700px'; track.height = '26px';
      track.background = '#0a3322'; track.color = '#1f7a55'; track.thickness = 2;
      bg.addControl(track);
      const fill = new Rectangle(`cockpit-fill-${label}`);
      fill.horizontalAlignment = 0; // grow from the left
      fill.width = '0%'; fill.height = '100%';
      fill.background = '#33FF99'; fill.thickness = 0;
      track.addControl(fill);
      return fill;
    };
    this.spdFill = gauge('SPD', 70);
    this.altFill = gauge('ALT', 116);
    this.hullFill = gauge('HULL', 162);

    this.built = true;
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

  /** Drive the speed / altitude / hull gauge bars (each 0..100%). No-op headless. */
  setGauges(spd: number, alt: number, hull: number): void {
    if (this.spdFill) this.spdFill.width = `${Math.max(0, Math.min(100, spd))}%`;
    if (this.altFill) this.altFill.width = `${Math.max(0, Math.min(100, alt))}%`;
    if (this.hullFill) this.hullFill.width = `${Math.max(0, Math.min(100, hull))}%`;
  }

  dispose(): void {
    this.lcdTexture?.dispose(); // not a scene-graph child of the pivot — dispose explicitly
    this.lcdTexture = null;
    this.bannerBlock = null;
    this.spdFill = this.altFill = this.hullFill = null;
    this.root?.dispose(false, true); // dispose the cockpit subtree + its materials
    this.root = null;
    this.built = false;
  }
}
