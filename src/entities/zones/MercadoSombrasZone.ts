import {
  Scene, Vector3, Color3, Color4, MeshBuilder, StandardMaterial,
  HemisphericLight, PointLight, ParticleSystem, Texture, AbstractMesh, Mesh, TransformNode,
  PhysicsAggregate, PhysicsShapeType,
} from '@babylonjs/core';
import { WorldZone, ZoneBounds } from '@entities/WorldZone';
import { MERCADO_PROPS, EXIT_WALL, CORRIDOR_COLLIDERS, ZONE_HALF, ANIMAL_MODELS, TRASH_MODELS } from '@assets/WorldAssetCatalog';
import { borderWallColliders } from '@systems/world/WorldGrid';
import { framePlanes, crosswalkStripes, manholeSpots, interiorBuildingSlots } from '@assets/world/CityFrame';
import { mulberry32 } from '@systems/world/SeededRng';
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

  /**
   * Mosaic mode (Fase 17): when true (default), the +X end of the street is OPEN
   * — no black exit wall, no east/exit colliders — so the player walks east into
   * the procedural neighbor tile (1,0). The west dead-end + N/S building rows still
   * cap the other sides (west/south are world borders). Set false for a standalone
   * closed street (legacy).
   */
  constructor(private readonly openEast = true) {
    super();
  }

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
    if (this.openEast) {
      // Mosaic (Fase 17G): this tile is a city block — asphalt-grid frame + sidewalk
      // ring + interior, with crosswalks on the edges (no central road).
      this.buildUrbanFrame(scene);
      this.buildCrosswalks(scene);
    } else {
      this.buildGround(scene);
      this.buildRoadMarkings(scene);
    }
    this.buildLighting(scene);
    this.buildBuildings(scene);
    this.buildStalls(scene);
    if (!this.openEast) this.buildExitWall(scene); // mosaic: leave +X open to tile (1,0)
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
    // THIS plane IS the street asphalt: it faces up (correct normals → lit), covers
    // the whole district seamlessly, and takes the flashlight cleanly. Sidewalks
    // (y≈0.03) sit just above it like a low curb. (We dropped the MegaKit road tiles:
    // that pack tile is directional + flat-normalled and tiled with gaps/black under
    // the glTF import wrapper; a lit ground plane is robust. Lane/crosswalk decals can
    // be laid on top later for flavour.)
    ground.position.y = 0;
    const mat = new StandardMaterial('ground-mat', scene);
    mat.diffuseColor = new Color3(0.2, 0.2, 0.23); // mid-dark asphalt grey (reads under night ambient)
    mat.specularColor = new Color3(0, 0, 0); // no sheen → no harsh flashlight hotspot
    ground.material = mat;
    this.meshes.push(ground);
  }

  /**
   * City-grid frame (Fase 17G): asphalt ▸ sidewalk ▸ interior planes for tile (0,0).
   * The outer asphalt ring is the road (continuous with the neighbour tiles).
   */
  private buildUrbanFrame(scene: Scene): void {
    const asphalt = new Color3(0.13, 0.13, 0.15);
    const sidewalk = new Color3(0.40, 0.40, 0.44);
    const interior = new Color3(0.2, 0.2, 0.23); // downtown lot grey
    for (const p of framePlanes(0, 0)) {
      const g = MeshBuilder.CreateGround(p.key, { width: p.size[0], height: p.size[1] }, scene);
      g.position.set(p.center[0], p.center[1], p.center[2]);
      const mat = new StandardMaterial(`${p.key}-mat`, scene);
      mat.diffuseColor = p.kind === 'asphalt' ? asphalt : p.kind === 'sidewalk' ? sidewalk : interior;
      mat.specularColor = new Color3(0, 0, 0);
      g.material = mat;
      this.meshes.push(g);
    }
  }

  /** Emissive zebra crosswalks crossing the road at each of the 4 tile edges. */
  private buildCrosswalks(scene: Scene): void {
    const mat = new StandardMaterial('xw-mat', scene);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = new Color3(0.9, 0.92, 0.95);
    for (const s of crosswalkStripes(0, 0)) {
      const bar = MeshBuilder.CreateGround(s.key, { width: s.size[0], height: s.size[1] }, scene);
      bar.position.set(s.center[0], s.center[1], s.center[2]);
      bar.material = mat;
      this.meshes.push(bar);
    }
  }

  /**
   * Road markings as glowing paint: a dashed centre line down the street + two
   * pedestrian crosswalks. Drawn as EMISSIVE flat tiles so they read at night and
   * never go dark (emissive ignores lighting/normals — unlike a textured decal).
   */
  private buildRoadMarkings(scene: Scene): void {
    const paint = (name: string, color: Color3): StandardMaterial => {
      const m = new StandardMaterial(name, scene);
      m.diffuseColor = new Color3(0, 0, 0);
      m.specularColor = new Color3(0, 0, 0);
      m.emissiveColor = color; // pure glow → always visible
      return m;
    };
    const lineMat = paint('road-line-mat', new Color3(0.85, 0.78, 0.35)); // amber centre line
    const zebraMat = paint('road-zebra-mat', new Color3(0.9, 0.92, 0.95)); // white crosswalk

    const stripe = (name: string, x: number, z: number, w: number, d: number, mat: StandardMaterial): void => {
      const s = MeshBuilder.CreateGround(name, { width: w, height: d }, scene);
      s.position.set(x, 0.04, z); // just above the asphalt (ground y=0), below the sidewalk curb
      s.material = mat;
      this.meshes.push(s);
    };

    // Dashed amber centre line along the street (X), at z=0.
    for (let x = -24; x <= 24; x += 4) stripe(`road-dash-${x}`, x, 0, 1.6, 0.18, lineMat);

    // Two zebra crosswalks (bars across the 9-wide road), near the street ends.
    for (const cx of [-16, 16]) {
      for (let i = 0; i < 7; i += 1) {
        const bx = cx + (i - 3) * 0.8; // 7 bars spaced 0.8 along X
        stripe(`road-zebra-${cx}-${i}`, bx, 0, 0.4, 8, zebraMat);
      }
    }
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
    // Mosaic (Fase 17G): buildings go into the interior block slots (no overlap),
    // scaled to fit; the central sidewalks/doors are replaced by the sidewalk-ring
    // frame, and the gap-filler brick walls are gone — only world borders matter.
    const slots = this.openEast ? interiorBuildingSlots(0, 0) : [];
    let bldIdx = 0;
    for (const p of MERCADO_PROPS) {
      if (this.openEast && /^(wall-|sidewalk-|door-)/.test(p.key)) continue;
      let pos = p.position;
      let rotY = p.rotationY ?? 0;
      let fit: number | undefined;
      if (this.openEast && p.key.startsWith('bld-')) {
        if (bldIdx >= slots.length) continue; // cap to the interior block slots
        const slot = slots[bldIdx];
        bldIdx += 1;
        pos = slot.position;
        rotY = slot.rotationY;
        fit = slot.footprint;
      }
      try {
        const c = await SceneLoader.LoadAssetContainerAsync('/assets/', p.model, scene);
        c.addAllToScene();
        // Wrap in a holder node and parent every top-level loaded node to it, so
        // position/rotation/scale apply to the whole model (mirrors VehicleController).
        const holder = new TransformNode(p.key, scene);
        holder.position.set(pos[0], pos[1], pos[2]);
        holder.rotation.y = rotY;
        if (Array.isArray(p.scale)) holder.scaling.set(p.scale[0], p.scale[1], p.scale[2]);
        else holder.scaling.setAll(p.scale ?? 1);
        for (const m of c.meshes) {
          if (!m.parent) m.parent = holder;
        }
        for (const t of c.transformNodes) {
          if (!t.parent) t.parent = holder;
        }
        if (fit) {
          holder.computeWorldMatrix(true);
          const { min, max } = holder.getHierarchyBoundingVectors(true);
          const extent = Math.max(max.x - min.x, max.z - min.z);
          if (extent > 0.001 && extent > fit) holder.scaling.scaleInPlace(fit / extent);
        }
        this.meshes.push(...(c.meshes as AbstractMesh[]));
        this.holders.push(holder);
        ok += 1;
      } catch (err) {
        console.warn(`[Mercado] prop "${p.key}" (${p.model}) failed to load, keeping placeholder:`, err);
      }
    }
    // Manhole covers on the asphalt road ring (mosaic only).
    if (this.openEast) {
      for (const [i, spot] of manholeSpots(0, 0, mulberry32(99)).entries()) {
        try {
          const c = await SceneLoader.LoadAssetContainerAsync('/assets/', 'world/downtown/prop_manholecover.glb', scene);
          c.addAllToScene();
          const holder = new TransformNode(`manhole-${i}`, scene);
          holder.position.set(spot[0], spot[1], spot[2]);
          for (const m of c.meshes) if (!m.parent) m.parent = holder;
          for (const t of c.transformNodes) if (!t.parent) t.parent = holder;
          this.meshes.push(...(c.meshes as AbstractMesh[]));
          this.holders.push(holder);
        } catch { /* tolerant */ }
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
    if (this.openEast) {
      // Mosaic mode: this is the SW-corner tile (0,0) — only its WORLD-border edges
      // (west −X, south −Z) get a wall. North (→ tile 0,1) and east (→ tile 1,0)
      // stay open; the buildings remain solid obstacles, no gap-filler walls.
      for (const c of borderWallColliders(0, 0)) {
        this.addBoxCollider(scene, c.key, new Vector3(c.position[0], c.position[1], c.position[2]), new Vector3(c.size[0], c.size[1], c.size[2]));
      }
    } else {
      // Standalone (legacy) closed street: full perimeter + black exit wall.
      for (const c of CORRIDOR_COLLIDERS) {
        this.addBoxCollider(scene, c.key, new Vector3(c.position[0], c.position[1], c.position[2]), new Vector3(c.size[0], c.size[1], c.size[2]));
      }
      this.addBoxCollider(scene, 'col-exit', new Vector3(EXIT_WALL.position[0], EXIT_WALL.position[1], EXIT_WALL.position[2]), new Vector3(EXIT_WALL.size[0], EXIT_WALL.size[1], EXIT_WALL.size[2]));
    }
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
