/**
 * Dynamic sky system — pure state math + browser-only renderer.
 *
 * Pure exports (fully testable with NullEngine):
 *   SkyState, computeSkyState, sunElevationRad, celestialDirection,
 *   sunColorForElevation, starOpacityForHour, lerpDayPalette, lerpColor
 *
 * Browser-only (guarded, istanbul ignored):
 *   SkyRenderer — dome (gradient shader), sun/moon meshes, star SPS,
 *                 DirectionalLight tracking the sun.
 */

import { normalizeHour, DayPalette, smoothPaletteForHour } from '@systems/GameClock';

// ─── Pure types & math ──────────────────────────────────────────────────────

export interface SkyState {
  /** Zenith (top-of-sky) gradient color [r, g, b] 0..1 */
  zenithColor:   [number, number, number];
  /** Horizon gradient color [r, g, b] 0..1 */
  horizonColor:  [number, number, number];
  /** Normalized 3D world-space direction toward the sun (Y up, Z north, X east). */
  sunDirection:  [number, number, number];
  /** Sun disc color [r, g, b] 0..1 — yellow at noon, orange/red near horizon. */
  sunColor:      [number, number, number];
  /** 0..1 — 0 when the sun is more than 5° below the horizon. */
  sunVisibility: number;
  /** Normalized 3D direction toward the moon (roughly opposite of sun). */
  moonDirection: [number, number, number];
  /** 0..1 — 0 when the moon is more than 5° below the horizon. */
  moonVisibility: number;
  /** 0..1 — star layer opacity (0 at noon, 1 at midnight). */
  starOpacity:   number;
  /** Smooth-interpolated ambient + fog palette. */
  palette:       DayPalette;
}

/** Normalize any value into [0, 1) range. */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Lerp between two floats. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** Lerp between two RGB triples. */
export function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const s = clamp01(t);
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
}

/** Lerp between two DayPalettes. */
export function lerpDayPalette(a: DayPalette, b: DayPalette, t: number): DayPalette {
  return {
    ambientIntensity: lerp(a.ambientIntensity, b.ambientIntensity, t),
    ambient:  lerpColor(a.ambient,  b.ambient,  t),
    ground:   lerpColor(a.ground,   b.ground,   t),
    fog:      lerpColor(a.fog,      b.fog,      t),
    fogDensity: lerp(a.fogDensity, b.fogDensity, t),
  };
}

/**
 * Sun elevation above the horizon in radians as a function of hour-of-day.
 * Returns +π/3 at solar noon (12:00), 0 at 6:00 and 18:00, −π/3 at midnight.
 * The formula is a simple sinusoidal approximation (no latitude/season).
 */
export function sunElevationRad(hour: number): number {
  const h = normalizeHour(hour);
  // Map [0,24] → angle where sin peaks at h=12 and troughs at h=0/24
  return Math.sin(((h - 6) / 24) * 2 * Math.PI) * (Math.PI / 3);
}

/**
 * Convert an elevation + azimuth angle (radians) to a normalized 3D direction.
 * Coordinate system: Y = up, Z = north, X = east.
 *   azimuth = 0   → north  (+Z)
 *   azimuth = π/2 → east   (+X)
 *   azimuth = π   → south  (−Z)
 */
export function celestialDirection(
  elevationRad: number,
  azimuthRad: number,
): [number, number, number] {
  const cosEl = Math.cos(elevationRad);
  const x = cosEl * Math.sin(azimuthRad);
  const y = Math.sin(elevationRad);
  const z = cosEl * Math.cos(azimuthRad);
  const len = Math.sqrt(x * x + y * y + z * z);
  /* istanbul ignore next */
  if (len < 1e-9) return [0, 1, 0];
  return [x / len, y / len, z / len];
}

/**
 * Sun disc color based on elevation.
 *   > 30°  → warm yellow
 *   5°–30° → orange
 *   ≤ 5°   → deep red (near horizon)
 */
export function sunColorForElevation(elevationRad: number): [number, number, number] {
  const deg = elevationRad * (180 / Math.PI);
  if (deg > 30) return [1.0, 0.95, 0.70];
  if (deg > 5)  return lerpColor([1.0, 0.35, 0.10], [1.0, 0.95, 0.70], (deg - 5) / 25);
  return [1.0, 0.35, 0.10];
}

/**
 * Star layer opacity (0 = invisible, 1 = full brightness).
 * Fades in during dusk (18h→20h) and fades out during dawn (5h→8h).
 */
export function starOpacityForHour(hour: number): number {
  const h = normalizeHour(hour);
  if (h >= 20 || h < 5) return 1;           // full night
  if (h >= 18 && h < 20) return (h - 18) / 2; // dusk ramp-in
  if (h >= 5  && h < 8)  return 1 - (h - 5) / 3; // dawn ramp-out
  return 0;                                   // day
}

/**
 * Sky keyframes for zenith/horizon gradient.
 * Intermediate hours are linearly interpolated between adjacent entries.
 */
const SKY_KEYFRAMES: Array<{
  hour: number;
  zenith:  [number, number, number];
  horizon: [number, number, number];
}> = [
  { hour:  0, zenith: [0.01, 0.01, 0.04], horizon: [0.02, 0.02, 0.08] },
  { hour:  5, zenith: [0.04, 0.03, 0.10], horizon: [0.08, 0.05, 0.15] },
  { hour:  6, zenith: [0.35, 0.18, 0.25], horizon: [0.85, 0.45, 0.20] },
  { hour:  8, zenith: [0.25, 0.45, 0.75], horizon: [0.65, 0.80, 0.90] },
  { hour: 18, zenith: [0.25, 0.40, 0.70], horizon: [0.70, 0.55, 0.30] },
  { hour: 19, zenith: [0.12, 0.08, 0.20], horizon: [0.80, 0.30, 0.10] },
  { hour: 20, zenith: [0.02, 0.02, 0.06], horizon: [0.05, 0.03, 0.10] },
  { hour: 24, zenith: [0.01, 0.01, 0.04], horizon: [0.02, 0.02, 0.08] },
];

/** Interpolate sky gradient colors for a given hour-of-day. */
function skyColorsForHour(hour: number): {
  zenith:  [number, number, number];
  horizon: [number, number, number];
} {
  const h = normalizeHour(hour);
  // Find the surrounding keyframes
  let lo = SKY_KEYFRAMES[0];
  let hi = SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1];
  for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
    if (h >= SKY_KEYFRAMES[i].hour && h < SKY_KEYFRAMES[i + 1].hour) {
      lo = SKY_KEYFRAMES[i];
      hi = SKY_KEYFRAMES[i + 1];
      break;
    }
  }
  const span = hi.hour - lo.hour;
  /* istanbul ignore next */
  const t = span > 0 ? (h - lo.hour) / span : 0;
  return {
    zenith:  lerpColor(lo.zenith,  hi.zenith,  t),
    horizon: lerpColor(lo.horizon, hi.horizon, t),
  };
}

/** Azimuth of the sun in radians: rises east (π/2), sets west (3π/2). */
const SUN_AZIMUTH = Math.PI / 2;

/**
 * Compute the full sky state for a given hour-of-day.
 * All outputs are [0,1]-clamped and normalized.
 */
export function computeSkyState(hour: number): SkyState {
  const colors  = skyColorsForHour(hour);
  const sunEl   = sunElevationRad(hour);
  const sunDir  = celestialDirection(sunEl, SUN_AZIMUTH);
  // Moon is roughly opposite (sets when sun rises, rises when sun sets)
  const moonEl  = -sunEl;
  const moonDir = celestialDirection(moonEl, SUN_AZIMUTH + Math.PI);

  // Visibility = smoothstep around the 5° horizon crossing
  const HORIZON_DEG = 5 * (Math.PI / 180);
  const sunVis  = clamp01((sunEl  + HORIZON_DEG) / (2 * HORIZON_DEG));
  const moonVis = clamp01((moonEl + HORIZON_DEG) / (2 * HORIZON_DEG));

  return {
    zenithColor:  colors.zenith,
    horizonColor: colors.horizon,
    sunDirection:  sunDir,
    sunColor:      sunColorForElevation(sunEl),
    sunVisibility: sunVis,
    moonDirection: moonDir,
    moonVisibility: moonVis,
    starOpacity:   starOpacityForHour(hour),
    palette:       smoothPaletteForHour(hour),
  };
}

// ─── Browser-only renderer ──────────────────────────────────────────────────

/* istanbul ignore next — browser/Electron only */
export class SkyRenderer {
  private dome:     import('@babylonjs/core').Mesh | null = null;
  private sunMesh:  import('@babylonjs/core').Mesh | null = null;
  private moonMesh: import('@babylonjs/core').Mesh | null = null;
  private starSPS:  import('@babylonjs/core').SolidParticleSystem | null = null;
  private starMesh: import('@babylonjs/core').Mesh | null = null;
  private sunLight: import('@babylonjs/core').DirectionalLight | null = null;
  private lastStarOpacity = -1;

  /* istanbul ignore next */
  async init(
    scene: import('@babylonjs/core').Scene,
    camera: import('@babylonjs/core').Camera,
  ): Promise<void> {
    if (typeof document === 'undefined') return;
    const BJS = await import('@babylonjs/core');
    this.buildDome(BJS, scene, camera);
    this.buildSun(BJS, scene);
    this.buildMoon(BJS, scene);
    this.buildStars(BJS, scene, camera);
    this.buildSunLight(BJS, scene);
  }

  /* istanbul ignore next */
  private buildDome(
    BJS: typeof import('@babylonjs/core'),
    scene: import('@babylonjs/core').Scene,
    camera: import('@babylonjs/core').Camera,
  ): void {
    const dome = BJS.MeshBuilder.CreateSphere(
      'sky-dome',
      { diameter: 900, segments: 8, sideOrientation: BJS.Mesh.BACKSIDE },
      scene,
    );
    dome.isPickable = false;

    const mat = new BJS.ShaderMaterial(
      'sky-shader',
      scene,
      {
        vertexSource: `
          precision highp float;
          attribute vec3 position;
          uniform mat4 worldViewProjection;
          varying vec3 vPos;
          void main(void) {
            gl_Position = worldViewProjection * vec4(position, 1.0);
            vPos = normalize(position);
          }`,
        fragmentSource: `
          precision highp float;
          uniform vec3 zenithColor;
          uniform vec3 horizonColor;
          varying vec3 vPos;
          void main(void) {
            float t = clamp(vPos.y, 0.0, 1.0);
            gl_FragColor = vec4(mix(horizonColor, zenithColor, t), 1.0);
          }`,
      },
      {
        attributes: ['position'],
        uniforms: ['worldViewProjection', 'zenithColor', 'horizonColor'],
      },
    );
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;

    dome.material = mat;
    dome.infiniteDistance = true;
    dome.renderingGroupId = 0;
    dome.parent = camera;
    this.dome = dome;
  }

  /* istanbul ignore next */
  private buildSun(
    BJS: typeof import('@babylonjs/core'),
    scene: import('@babylonjs/core').Scene,
  ): void {
    const sun = BJS.MeshBuilder.CreateSphere('sky-sun', { diameter: 14, segments: 6 }, scene);
    sun.isPickable = false;
    sun.renderingGroupId = 0;
    const mat = new BJS.StandardMaterial('sky-sun-mat', scene);
    mat.emissiveColor = new BJS.Color3(1, 0.95, 0.7);
    mat.disableLighting = true;
    sun.material = mat;
    this.sunMesh = sun;
  }

  /* istanbul ignore next */
  private buildMoon(
    BJS: typeof import('@babylonjs/core'),
    scene: import('@babylonjs/core').Scene,
  ): void {
    const moon = BJS.MeshBuilder.CreateSphere('sky-moon', { diameter: 9, segments: 6 }, scene);
    moon.isPickable = false;
    moon.renderingGroupId = 0;
    const mat = new BJS.StandardMaterial('sky-moon-mat', scene);
    mat.emissiveColor = new BJS.Color3(0.92, 0.95, 1.0);
    mat.disableLighting = true;
    moon.material = mat;
    this.moonMesh = moon;
  }

  /* istanbul ignore next */
  private buildStars(
    BJS: typeof import('@babylonjs/core'),
    scene: import('@babylonjs/core').Scene,
    camera: import('@babylonjs/core').Camera,
  ): void {
    const STAR_COUNT = 150;
    const STAR_RADIUS = 430;
    const NORTH_STAR_EL = 20 * (Math.PI / 180); // 20° elevation for the North Star

    const sps = new BJS.SolidParticleSystem('sky-stars', scene, { isPickable: false });
    const box = BJS.MeshBuilder.CreateBox('_star-tmp', { size: 0.55 }, scene);
    sps.addShape(box, STAR_COUNT);
    box.dispose();

    const mesh = sps.buildMesh();
    mesh.isPickable = false;
    mesh.renderingGroupId = 0;
    mesh.parent = camera;

    const mat = new BJS.StandardMaterial('sky-star-mat', scene);
    mat.emissiveColor = new BJS.Color3(1, 1, 1);
    mat.disableLighting = true;
    mesh.material = mat;

    // Fibonacci sphere distribution for even star spreading
    const PHI = Math.PI * (1 + Math.sqrt(5));
    sps.initParticles = () => {
      for (let i = 0; i < STAR_COUNT; i++) {
        const p = sps.particles[i];
        // North Star: index 0 → fixed north position, slightly larger & bluer
        if (i === 0) {
          const r = STAR_RADIUS;
          p.position.set(0, r * Math.sin(NORTH_STAR_EL), r * Math.cos(NORTH_STAR_EL));
          p.scaling.setAll(1.6);
          p.color = new BJS.Color4(0.85, 0.90, 1.0, 1);
          continue;
        }
        const phi = Math.acos(1 - 2 * (i + 0.5) / STAR_COUNT);
        const theta = PHI * i;
        p.position.set(
          STAR_RADIUS * Math.sin(phi) * Math.cos(theta),
          STAR_RADIUS * Math.cos(phi),
          STAR_RADIUS * Math.sin(phi) * Math.sin(theta),
        );
        // Keep stars above the horizon (lower hemisphere still appears, just very faint)
        p.scaling.setAll(1.0);
        p.color = new BJS.Color4(1, 1, 0.95, 1);
      }
    };
    sps.initParticles();
    sps.setParticles();
    this.starSPS = sps;
    this.starMesh = mesh;
  }

  /* istanbul ignore next */
  private buildSunLight(
    BJS: typeof import('@babylonjs/core'),
    scene: import('@babylonjs/core').Scene,
  ): void {
    // A gentle directional light that follows the sun — gives soft daytime shadows.
    const light = new BJS.DirectionalLight('sky-sun-light', new BJS.Vector3(0, -1, 0), scene);
    light.intensity = 0;
    light.diffuse = new BJS.Color3(1.0, 0.95, 0.85);
    this.sunLight = light;
  }

  /* istanbul ignore next */
  update(
    state: SkyState,
    scene: import('@babylonjs/core').Scene,
  ): void {
    if (typeof document === 'undefined') return;

    // Dome gradient
    if (this.dome?.material) {
      const mat = this.dome.material as import('@babylonjs/core').ShaderMaterial;
      // Use dynamic import is awkward here — use the global BJS objects via scene
      // access them via scene constructor — or just set uniforms by name.
      mat.setVector3('zenithColor', { x: state.zenithColor[0], y: state.zenithColor[1], z: state.zenithColor[2] } as any);
      mat.setVector3('horizonColor', { x: state.horizonColor[0], y: state.horizonColor[1], z: state.horizonColor[2] } as any);
    }

    // Scene clear color tracks zenith
    scene.clearColor.r = state.zenithColor[0];
    scene.clearColor.g = state.zenithColor[1];
    scene.clearColor.b = state.zenithColor[2];
    scene.clearColor.a = 1;

    // Sun mesh
    const SKY_RADIUS = 420;
    if (this.sunMesh) {
      const d = state.sunDirection;
      this.sunMesh.position.set(d[0] * SKY_RADIUS, d[1] * SKY_RADIUS, d[2] * SKY_RADIUS);
      this.sunMesh.isVisible = state.sunVisibility > 0.01;
      if (this.sunMesh.material) {
        const mat = this.sunMesh.material as import('@babylonjs/core').StandardMaterial;
        const c = state.sunColor;
        mat.emissiveColor.set(c[0] * state.sunVisibility, c[1] * state.sunVisibility, c[2] * state.sunVisibility);
      }
    }

    // Moon mesh
    if (this.moonMesh) {
      const d = state.moonDirection;
      this.moonMesh.position.set(d[0] * SKY_RADIUS, d[1] * SKY_RADIUS, d[2] * SKY_RADIUS);
      this.moonMesh.isVisible = state.moonVisibility > 0.01;
    }

    // Star opacity (only update SPS when opacity changes meaningfully)
    const newOp = state.starOpacity;
    if (Math.abs(newOp - this.lastStarOpacity) > 0.005 && this.starSPS) {
      this.lastStarOpacity = newOp;
      for (const p of this.starSPS.particles) {
        p.color!.a = newOp;
      }
      this.starSPS.setParticles();
    }

    // Sun directional light
    if (this.sunLight) {
      const d = state.sunDirection;
      this.sunLight.direction.set(-d[0], -d[1], -d[2]);
      // Intensity proportional to sun elevation above horizon
      const elevAbove = Math.max(0, d[1]);
      this.sunLight.intensity = elevAbove * 0.4;
    }
  }

  /* istanbul ignore next */
  dispose(): void {
    if (typeof document === 'undefined') return;
    this.sunLight?.dispose();
    this.sunLight = null;
    this.dome?.dispose();
    this.dome = null;
    this.sunMesh?.dispose();
    this.sunMesh = null;
    this.moonMesh?.dispose();
    this.moonMesh = null;
    this.starSPS?.dispose();
    this.starSPS = null;
    this.starMesh?.dispose();
    this.starMesh = null;
  }
}
