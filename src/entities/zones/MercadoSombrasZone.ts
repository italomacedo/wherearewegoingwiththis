import {
  Scene, Vector3, Color3, Color4, MeshBuilder, StandardMaterial,
  HemisphericLight, PointLight, ParticleSystem, Texture, AbstractMesh, Mesh, TransformNode,
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
  private holders: TransformNode[] = [];

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
    mat.diffuseColor = new Color3(0.1, 0.1, 0.11); // neutral dark asphalt base under the tiles
    mat.specularColor = new Color3(0.18, 0.2, 0.24); // faint wet sheen
    mat.specularPower = 64;
    ground.material = mat;
    this.meshes.push(ground);
  }

  private buildLighting(scene: Scene): void {
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
    ambient.intensity = 0.45; // brighter so the textured downtown reads at night
    ambient.diffuse = new Color3(0.45, 0.5, 0.7);
    ambient.groundColor = new Color3(0.12, 0.12, 0.16);

    // Neon streetlights lining the street (alternating sides along X).
    const neon: Array<[number, number, Color3]> = [
      [-18, 6, new Color3(0, 1, 0.8)],
      [-6, -6, new Color3(0.6, 0, 1)],
      [6, 6, new Color3(1, 0.2, 0.5)],
      [18, -6, new Color3(0.1, 0.6, 1)],
    ];
    neon.forEach(([x, z, c], i) => {
      const light = new PointLight(`neon-${i}`, new Vector3(x, 7, z), scene);
      light.diffuse = c;
      light.specular = c;
      light.intensity = 2.4;
      light.range = 24;
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
    const { SceneLoader, TransformNode } = await import('@babylonjs/core');
    await import('@babylonjs/loaders/glTF');
    let ok = 0;
    for (const p of MERCADO_PROPS) {
      try {
        const c = await SceneLoader.LoadAssetContainerAsync('/assets/', p.model, scene);
        c.addAllToScene();
        // Wrap in a holder node and parent every top-level loaded node to it, so
        // position/rotation/scale apply to the whole model (mirrors VehicleController).
        const holder = new TransformNode(p.key, scene);
        holder.position.set(p.position[0], p.position[1], p.position[2]);
        holder.rotation.y = p.rotationY ?? 0;
        if (Array.isArray(p.scale)) holder.scaling.set(p.scale[0], p.scale[1], p.scale[2]);
        else holder.scaling.setAll(p.scale ?? 1);
        for (const m of c.meshes) {
          if (!m.parent) m.parent = holder;
        }
        for (const t of c.transformNodes) {
          if (!t.parent) t.parent = holder;
        }
        this.meshes.push(...(c.meshes as AbstractMesh[]));
        this.holders.push(holder);
        ok += 1;
      } catch (err) {
        console.warn(`[Mercado] prop "${p.key}" (${p.model}) failed to load, keeping placeholder:`, err);
      }
    }
    // The downtown real assets supersede the procedural market — hide the box
    // towers and stall counters (left as the headless / missing-asset fallback).
    if (ok > 0) {
      this.meshes.forEach((m) => {
        if (/^(building|stall)-\d+$/.test(m.name)) m.setEnabled(false);
      });
    }
    console.warn(`[Mercado] real assets loaded: ${ok}/${MERCADO_PROPS.length}`);
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
    /* istanbul ignore next — holders only exist after browser GLB load */
    this.holders.forEach((h) => h.dispose());
    this.holders = [];
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
