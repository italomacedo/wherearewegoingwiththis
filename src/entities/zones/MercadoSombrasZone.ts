import {
  Scene, Vector3, Color3, Color4, MeshBuilder, StandardMaterial,
  HemisphericLight, PointLight, ParticleSystem, Texture, AbstractMesh, Mesh,
} from '@babylonjs/core';
import { WorldZone, ZoneBounds } from '@entities/WorldZone';
import { MERCADO_PROPS } from '@assets/WorldAssetCatalog';

/**
 * Mercado das Sombras — the starting underground street market district.
 * Built procedurally with Babylon.js primitives + emissive neon materials.
 * Real GLTF props / PBR textures are layered on in browser/Electron only.
 */
export class MercadoSombrasZone extends WorldZone {
  readonly id = 'mercado_sombras';
  readonly displayName = 'Mercado das Sombras';

  private lights: PointLight[] = [];

  getSpawnPoint(): Vector3 {
    return new Vector3(0, 0, 0);
  }

  getBounds(): ZoneBounds {
    return {
      min: new Vector3(-30, 0, -30),
      max: new Vector3(30, 0, 30),
    };
  }

  protected async build(scene: Scene): Promise<void> {
    this.buildGround(scene);
    this.buildLighting(scene);
    this.buildBuildings(scene);
    this.buildStalls(scene);
    this.buildRain(scene);
    // Real assets layered on in browser only
    /* istanbul ignore next — browser/Electron asset loading */
    if (typeof document !== 'undefined') {
      await this.loadRealAssets(scene);
    }
  }

  private buildGround(scene: Scene): void {
    const ground = MeshBuilder.CreateGround(
      'mercado-ground',
      { width: 60, height: 60 },
      scene
    );
    const mat = new StandardMaterial('ground-mat', scene);
    mat.diffuseColor = new Color3(0.06, 0.06, 0.09);
    mat.specularColor = new Color3(0.25, 0.28, 0.35); // wet sheen
    mat.specularPower = 64;
    ground.material = mat;
    this.meshes.push(ground);
  }

  private buildLighting(scene: Scene): void {
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
    ambient.intensity = 0.18;
    ambient.diffuse = new Color3(0.3, 0.4, 0.7);
    ambient.groundColor = new Color3(0.05, 0.05, 0.08);

    const neonColors = [
      new Color3(0, 1, 0.8),
      new Color3(0.6, 0, 1),
      new Color3(1, 0.2, 0.5),
      new Color3(0.1, 0.6, 1),
    ];
    neonColors.forEach((c, i) => {
      const angle = (i / neonColors.length) * Math.PI * 2;
      const light = new PointLight(
        `neon-${i}`,
        new Vector3(Math.cos(angle) * 12, 5, Math.sin(angle) * 12),
        scene
      );
      light.diffuse = c;
      light.specular = c;
      light.intensity = 2.2;
      light.range = 22;
      this.lights.push(light);
    });
  }

  private buildBuildings(scene: Scene): void {
    // Buildings ring the market on two rows
    const positions: Array<[number, number]> = [
      [-24, -24], [-12, -26], [0, -27], [12, -26], [24, -24],
      [-26, 0], [26, 0],
      [-24, 24], [-12, 26], [0, 27], [12, 26], [24, 24],
    ];
    positions.forEach(([x, z], i) => {
      const h = 8 + (i % 5) * 4;
      const box = MeshBuilder.CreateBox(
        `building-${i}`,
        { width: 6 + (i % 3), height: h, depth: 6 + (i % 2) },
        scene
      );
      box.position.set(x, h / 2, z);
      const mat = new StandardMaterial(`building-mat-${i}`, scene);
      mat.diffuseColor = new Color3(0.07, 0.07, 0.11);
      mat.emissiveColor = new Color3(0, (i % 4) * 0.04, (i % 3) * 0.05);
      mat.specularColor = Color3.Black();
      box.material = mat;
      this.meshes.push(box);
    });
  }

  private buildStalls(scene: Scene): void {
    // Market stalls arranged in two aisles
    const stallPositions: Array<[number, number]> = [
      [-6, -6], [-6, 0], [-6, 6],
      [6, -6], [6, 0], [6, 6],
    ];
    stallPositions.forEach(([x, z], i) => {
      const stall = this.buildStall(scene, i);
      stall.position.set(x, 0, z);
      this.meshes.push(stall);
    });
  }

  private buildStall(scene: Scene, index: number): Mesh {
    // Stall = canopy on a counter (single merged-ish placeholder)
    const counter = MeshBuilder.CreateBox(
      `stall-${index}`,
      { width: 2.5, height: 1, depth: 1.5 },
      scene
    );
    counter.position.y = 0.5;
    const mat = new StandardMaterial(`stall-mat-${index}`, scene);
    mat.diffuseColor = new Color3(0.15, 0.12, 0.1);
    mat.emissiveColor = new Color3(0.05, 0.1, 0.12);
    counter.material = mat;
    return counter;
  }

  private buildRain(scene: Scene): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — ParticleSystem texture needs browser */
    this.buildRainBrowser(scene);
  }

  /* istanbul ignore next — browser/Electron GLB loading; verified manually */
  private async loadRealAssets(scene: Scene): Promise<void> {
    const { SceneLoader } = await import('@babylonjs/core');
    await import('@babylonjs/loaders/glTF');
    for (const p of MERCADO_PROPS) {
      try {
        const c = await SceneLoader.LoadAssetContainerAsync('/assets/', p.model, scene);
        c.addAllToScene();
        const root = c.meshes.find((m) => m.name === '__root__') ?? c.meshes[0];
        if (root) {
          root.position.set(p.position[0], p.position[1], p.position[2]);
          if (p.rotationY) root.addRotation(0, p.rotationY, 0);
          root.scaling = root.scaling.scale(p.scale ?? 1);
          root.name = p.key;
        }
        this.meshes.push(...(c.meshes as AbstractMesh[]));
        // Hide the procedural placeholder this prop replaces (real asset won).
        if (p.replaces) scene.getMeshByName(p.replaces)?.setEnabled(false);
      } catch (err) {
        console.warn(`[Mercado] prop "${p.key}" failed to load, keeping placeholder:`, err);
      }
    }
  }

  /* istanbul ignore next */
  private buildRainBrowser(scene: Scene): void {
    const rain = new ParticleSystem('rain', 4000, scene);
    rain.particleTexture = new Texture(
      'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
      scene
    );
    rain.emitter = new Vector3(0, 28, 0);
    rain.minEmitBox = new Vector3(-30, 0, -30);
    rain.maxEmitBox = new Vector3(30, 0, 30);
    rain.direction1 = new Vector3(-0.2, -1, -0.1);
    rain.direction2 = new Vector3(0.2, -1, 0.1);
    rain.minSize = 0.01;
    rain.maxSize = 0.04;
    rain.minLifeTime = 1;
    rain.maxLifeTime = 1.8;
    rain.emitRate = 2000;
    rain.minEmitPower = 10;
    rain.maxEmitPower = 16;
    rain.color1 = new Color4(0.5, 0.7, 1, 0.6);
    rain.color2 = new Color4(0.3, 0.5, 0.9, 0.4);
    rain.colorDead = new Color4(0, 0, 0, 0);
    rain.start();
  }

  protected onUnload(): void {
    this.lights.forEach((l) => l.dispose());
    this.lights = [];
    if (this.scene) {
      /* istanbul ignore next — rain particle system only exists in browser */
      this.scene.particleSystems.slice().forEach((ps) => {
        if (ps.name === 'rain') ps.dispose();
      });
      this.scene.lights.slice().forEach((l) => {
        if (l.name === 'ambient') l.dispose();
      });
    }
  }

  /** Exposed for assertions in tests */
  getLightCount(): number {
    return this.lights.length;
  }

  getAllMeshes(): AbstractMesh[] {
    return [...this.meshes];
  }
}
