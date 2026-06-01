import {
  Scene, Vector3, Color3, Color4, MeshBuilder, StandardMaterial,
  HemisphericLight, PointLight, ParticleSystem, Texture, AbstractMesh, Mesh, TransformNode,
  PhysicsAggregate, PhysicsShapeType,
} from '@babylonjs/core';
import { WorldZone, ZoneBounds } from '@entities/WorldZone';
import { MERCADO_PROPS, EXIT_WALL, CORRIDOR_COLLIDERS, ZONE_HALF, ANIMAL_MODELS, TRASH_MODELS } from '@assets/WorldAssetCatalog';
import { DayPeriod, paletteForPeriod } from '@systems/GameClock';
import { DOG_SPAWNS, DOG_BOUNDS, BEGGAR_SPOTS, TRASH_SPOTS, stepDog, DogState } from '@entities/AmbientLife';
import type { Observer } from '@babylonjs/core';

/** Prop keys that should block the player (solid). Floor-like props (roads,
 *  sidewalks, food, manhole, drain, decals) are intentionally walkable. */
const SOLID_PROP = /^(bld-|wall-|vendor-shelf|prop-bollard|prop-acunit|prop-planter)/;

/**
 * Mercado das Sombras — the starting underground street market district.
 * Built procedurally with Babylon.js primitives + emissive neon materials.
 * Real GLTF props / PBR textures are layered on in browser/Electron only.
 */
export class MercadoSombrasZone extends WorldZone {
  readonly id = 'mercado_sombras';
  readonly displayName = 'Mercado das Sombras';

  private lights: PointLight[] = [];
  private ambient: HemisphericLight | null = null;
  private holders: TransformNode[] = [];
  private colliders: AbstractMesh[] = [];
  private aggregates: PhysicsAggregate[] = [];
  /** Per-frame stray-dog animation observer (Fase 6); removed on unload. */
  private dogObserver: Observer<Scene> | null = null;

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
    this.buildExitWall(scene);
    this.buildRain(scene);
    // Real assets layered on in browser only
    /* istanbul ignore next — browser/Electron asset loading */
    if (typeof document !== 'undefined') {
      await this.loadRealAssets(scene);
      await this.buildAmbientLife(scene);
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
    ambient.intensity = 0.7; // near-neutral fill so the asphalt reads grey, not flooded
    ambient.diffuse = new Color3(0.62, 0.64, 0.7);
    ambient.groundColor = new Color3(0.2, 0.2, 0.24);
    this.ambient = ambient; // re-tinted per time-of-day via applyTimeOfDay()

    // Neon streetlights lining the street — local accent glows, not a colour wash.
    const neon: Array<[number, number, Color3]> = [
      [-18, 6, new Color3(0, 1, 0.8)],
      [-6, -6, new Color3(0.6, 0, 1)],
      [6, 6, new Color3(1, 0.2, 0.5)],
      [18, -6, new Color3(0.1, 0.6, 1)],
    ];
    neon.forEach(([x, z, c], i) => {
      const light = new PointLight(`neon-${i}`, new Vector3(x, 5, z), scene);
      light.diffuse = c;
      light.specular = c;
      light.intensity = 0.9;
      light.range = 12;
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

  /** Black wall closing the +X end of the street (future scene-transition trigger). */
  private buildExitWall(scene: Scene): void {
    const wall = MeshBuilder.CreateBox(
      EXIT_WALL.key,
      { width: EXIT_WALL.size[0], height: EXIT_WALL.size[1], depth: EXIT_WALL.size[2] },
      scene
    );
    wall.position.set(EXIT_WALL.position[0], EXIT_WALL.position[1], EXIT_WALL.position[2]);
    const mat = new StandardMaterial('exit-wall-mat', scene);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = new Color3(0.02, 0.02, 0.04); // faint sheen so it reads as a surface
    wall.material = mat;
    this.meshes.push(wall);
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
    if (scene.isPhysicsEnabled()) this.buildColliders(scene);
  }

  /**
   * Street atmosphere (Fase 6): scattered trash + slumped beggar silhouettes
   * (procedural) and a few wandering stray dogs (Quaternius CC0 GLBs, animated
   * via the pure stepDog wander). Browser/Electron only; verified manually.
   */
  /* istanbul ignore next — browser/Electron meshes + GLB loading */
  private async buildAmbientLife(scene: Scene): Promise<void> {
    // Litter — real CC0 cans/bottles strewn in the gutters (walkable, no collider).
    await this.buildLitter(scene);

    // Beggars — slumped procedural silhouettes (non-interactive, no collider).
    const beggarMat = new StandardMaterial('beggar-mat', scene);
    beggarMat.diffuseColor = new Color3(0.12, 0.1, 0.1);
    beggarMat.specularColor = Color3.Black();
    BEGGAR_SPOTS.forEach((sgt, i) => {
      const body = MeshBuilder.CreateCylinder(`beggar-${i}`, { height: 0.9, diameterTop: 0.5, diameterBottom: 0.8 }, scene);
      body.position.set(sgt.x, 0.45, sgt.z);
      body.rotation.y = sgt.rotationY;
      body.material = beggarMat;
      const head = MeshBuilder.CreateSphere(`beggar-head-${i}`, { diameter: 0.26 }, scene);
      head.position.set(sgt.x, 0.95, sgt.z + Math.cos(sgt.rotationY) * 0.1);
      head.material = beggarMat;
      this.meshes.push(body, head);
    });

    // Stray dogs — load each GLB once, instantiate per spawn, wander + animate.
    await this.buildStrayDogs(scene);
  }

  /* istanbul ignore next — browser/Electron GLB loading */
  private async buildLitter(scene: Scene): Promise<void> {
    const { SceneLoader, TransformNode } = await import('@babylonjs/core');
    await import('@babylonjs/loaders/glTF');
    for (let i = 0; i < TRASH_SPOTS.length; i++) {
      const t = TRASH_SPOTS[i];
      try {
        const c = await SceneLoader.LoadAssetContainerAsync('/assets/', TRASH_MODELS[t.model], scene);
        c.addAllToScene();
        const holder = new TransformNode(`trash-${i}`, scene);
        holder.position.set(t.x, 0.02, t.z);
        holder.rotation.y = t.rotationY;
        holder.scaling.setAll(t.scale);
        c.meshes.forEach((m) => { if (!m.parent) m.parent = holder; });
        this.meshes.push(...(c.meshes as AbstractMesh[]));
        this.holders.push(holder);
      } catch (err) {
        console.warn(`[Mercado] litter "${t.model}" failed to load:`, err);
      }
    }
  }

  /* istanbul ignore next — browser/Electron GLB loading + animation */
  private async buildStrayDogs(scene: Scene): Promise<void> {
    const { SceneLoader, TransformNode } = await import('@babylonjs/core');
    await import('@babylonjs/loaders/glTF');

    interface Dog { holder: TransformNode; state: DogState; walk: import('@babylonjs/core').AnimationGroup | null; idle: import('@babylonjs/core').AnimationGroup | null; }
    const dogs: Dog[] = [];

    for (let i = 0; i < DOG_SPAWNS.length; i++) {
      const spawn = DOG_SPAWNS[i];
      try {
        const c = await SceneLoader.LoadAssetContainerAsync('/assets/', ANIMAL_MODELS[spawn.model], scene);
        const entries = c.instantiateModelsToScene((n) => `dog-${i}-${n}`, false);
        const holder = new TransformNode(`dog-holder-${i}`, scene);
        holder.scaling.setAll(0.5); // strays read small on the street
        entries.rootNodes.forEach((rn) => { if (!rn.parent) rn.parent = holder; });
        const g = entries.animationGroups;
        const walk = g.find((a) => a.name.toLowerCase().includes('walk')) ?? null;
        const idle = g.find((a) => /idle$/i.test(a.name)) ?? g.find((a) => a.name.toLowerCase().includes('idle')) ?? null;
        g.forEach((a) => a.stop());
        const state = { ...spawn.state };
        holder.position.set(state.x, 0, state.z);
        holder.rotation.y = state.heading;
        (state.moving ? walk : idle)?.start(true);
        dogs.push({ holder, state, walk, idle });
        this.holders.push(holder);
        c.meshes.forEach((m) => this.meshes.push(m));
      } catch (err) {
        console.warn(`[Mercado] stray dog "${spawn.model}" failed to load:`, err);
      }
    }
    if (dogs.length === 0) return;

    // Per-frame wander: step each dog, move/turn the holder, swap walk/idle clip.
    this.dogObserver = scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
      for (const dog of dogs) {
        const wasMoving = dog.state.moving;
        dog.state = stepDog(dog.state, dt, DOG_BOUNDS, Math.random);
        dog.holder.position.set(dog.state.x, 0, dog.state.z);
        dog.holder.rotation.y = dog.state.heading;
        if (dog.state.moving !== wasMoving) {
          (dog.state.moving ? dog.idle : dog.walk)?.stop();
          (dog.state.moving ? dog.walk : dog.idle)?.start(true);
        }
      }
    });
    console.warn(`[Mercado] stray dogs: ${dogs.length}`);
  }

  /* istanbul ignore next — physics colliders are browser/Electron only */
  private buildColliders(scene: Scene): void {
    // Floor — gives the character controller ground to stand on.
    this.addBoxCollider(scene, 'col-floor', new Vector3(0, -0.5, 0), new Vector3(ZONE_HALF * 2, 1, ZONE_HALF * 2));
    // Closed perimeter (side walls + ends).
    for (const c of CORRIDOR_COLLIDERS) {
      this.addBoxCollider(scene, c.key, new Vector3(c.position[0], c.position[1], c.position[2]), new Vector3(c.size[0], c.size[1], c.size[2]));
    }
    // Black exit wall.
    this.addBoxCollider(scene, 'col-exit', new Vector3(EXIT_WALL.position[0], EXIT_WALL.position[1], EXIT_WALL.position[2]), new Vector3(EXIT_WALL.size[0], EXIT_WALL.size[1], EXIT_WALL.size[2]));
    // Solid loaded props (buildings, walls, shelf, bollards, AC, planter) → box
    // collider from each one's world bounding box.
    for (const h of this.holders) {
      if (!SOLID_PROP.test(h.name)) continue;
      const { min, max } = h.getHierarchyBoundingVectors(true);
      const size = max.subtract(min);
      if (size.x < 0.05 || size.y < 0.05 || size.z < 0.05) continue;
      this.addBoxCollider(scene, `col-${h.name}`, min.add(max).scale(0.5), size);
    }
    let count = this.aggregates.length;
    console.warn(`[Mercado] colliders: ${count}`);
  }

  /* istanbul ignore next — physics colliders are browser/Electron only */
  private addBoxCollider(scene: Scene, name: string, center: Vector3, size: Vector3): void {
    const box = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, scene);
    box.position.copyFrom(center);
    box.isVisible = false;
    const agg = new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0 }, scene);
    this.colliders.push(box);
    this.aggregates.push(agg);
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

  /**
   * Tint the ambient light + fog for the current time of day (the street has no
   * sky, so the period reads through light colour/intensity and a light fog).
   * Safe headless (NullEngine honours light + scene.fog props).
   */
  applyTimeOfDay(period: DayPeriod): void {
    const pal = paletteForPeriod(period);
    if (this.ambient) {
      this.ambient.intensity = pal.ambientIntensity;
      this.ambient.diffuse = new Color3(pal.ambient[0], pal.ambient[1], pal.ambient[2]);
      this.ambient.groundColor = new Color3(pal.ground[0], pal.ground[1], pal.ground[2]);
    }
    if (this.scene) {
      this.scene.fogMode = Scene.FOGMODE_EXP2;
      this.scene.fogDensity = pal.fogDensity;
      this.scene.fogColor = new Color3(pal.fog[0], pal.fog[1], pal.fog[2]);
    }
  }

  protected onUnload(): void {
    this.lights.forEach((l) => l.dispose());
    this.lights = [];
    this.ambient = null;
    /* istanbul ignore next — dog animation observer only exists in browser */
    if (this.dogObserver && this.scene) {
      this.scene.onBeforeRenderObservable.remove(this.dogObserver);
      this.dogObserver = null;
    }
    /* istanbul ignore next — holders only exist after browser GLB load */
    this.holders.forEach((h) => h.dispose());
    this.holders = [];
    /* istanbul ignore next — colliders only exist in browser with physics */
    this.aggregates.forEach((a) => a.dispose());
    this.aggregates = [];
    this.colliders.forEach((c) => c.dispose());
    this.colliders = [];
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
