/* istanbul ignore file -- browser-only Babylon scenery; the tile DATA it consumes
 * (ThemeRegistry.generateTile / WorldGrid colliders / CityFrame) is unit-tested. Verified in Electron. */

/**
 * TileScenery — the BROWSER content of one procedural mosaic tile (Fase 17).
 *
 * URBAN tiles (downtown/market) get the city-grid frame (CityFrame): asphalt ▸
 * sidewalk ▸ themed interior planes + emissive crosswalks on each edge + manhole
 * covers on the road; buildings sit in the interior slots, scaled to fit (no
 * overlap). NATURE tiles (park/forest/desert) get a single full-tile themed ground
 * and scattered foliage (off the grid). Props load as real GLBs (LoadAssetContainerAsync
 * + holder, like MercadoSombrasZone.loadRealAssets); solids + border walls get box
 * colliders. All meshes/holders/aggregates dispose together on unload.
 */

import {
  Scene, MeshBuilder, StandardMaterial, Color3, AbstractMesh, TransformNode,
  PhysicsAggregate, PhysicsShapeType, Vector3,
} from '@babylonjs/core';
import { TILE_SIZE, tileCenter, borderWallColliders, type TileCoord } from '@systems/world/WorldGrid';
import { tileRng, range } from '@systems/world/SeededRng';
import { framePlanes, crosswalkStripes, manholeSpots } from '@assets/world/CityFrame';
import type { TileProp } from '@assets/world/ThemeRegistry';

const ASPHALT = new Color3(0.13, 0.13, 0.15);
const SIDEWALK = new Color3(0.40, 0.40, 0.44);
const CROSSWALK = new Color3(0.9, 0.92, 0.95);
const MANHOLE_MODEL = 'world/downtown/prop_manholecover.glb';

export class TileScenery {
  private meshes: AbstractMesh[] = [];
  private holders: TransformNode[] = [];
  private aggregates: PhysicsAggregate[] = [];
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly coord: TileCoord,
    private readonly props: TileProp[],
    private readonly worldSeed: number,
    private readonly groundColor: [number, number, number],
    private readonly urban: boolean,
  ) {}

  async build(): Promise<void> {
    if (this.urban) this.buildUrbanFrame();
    else this.buildGround();
    this.buildBorderWalls();
    await this.loadProps(this.allLoadProps());
  }

  /** Nature tiles: one full-tile themed ground plane (off the road grid). */
  private buildGround(): void {
    const { tx, tz } = this.coord;
    const rng = tileRng(this.worldSeed, tx, tz);
    const [cx, , cz] = tileCenter(tx, tz);
    const ground = MeshBuilder.CreateGround(`tile-ground-${tx}-${tz}`, { width: TILE_SIZE, height: TILE_SIZE }, this.scene);
    ground.position.set(cx, 0, cz);
    const mat = new StandardMaterial(`tile-ground-mat-${tx}-${tz}`, this.scene);
    const [r, g, b] = this.groundColor;
    const j = range(rng, -0.02, 0.02);
    mat.diffuseColor = new Color3(r + j, g + j, b + j);
    mat.specularColor = new Color3(0, 0, 0);
    ground.material = mat;
    this.meshes.push(ground);
  }

  /** Urban tiles: asphalt ▸ sidewalk ▸ themed-interior planes + crosswalks. */
  private buildUrbanFrame(): void {
    const [ir, ig, ib] = this.groundColor;
    for (const p of framePlanes(this.coord.tx, this.coord.tz)) {
      const g = MeshBuilder.CreateGround(p.key, { width: p.size[0], height: p.size[1] }, this.scene);
      g.position.set(p.center[0], p.center[1], p.center[2]);
      const mat = new StandardMaterial(`${p.key}-mat`, this.scene);
      mat.diffuseColor = p.kind === 'asphalt' ? ASPHALT : p.kind === 'sidewalk' ? SIDEWALK : new Color3(ir, ig, ib);
      mat.specularColor = new Color3(0, 0, 0);
      g.material = mat;
      this.meshes.push(g);
    }
    // Emissive zebra crosswalks across the road at each edge.
    const xwMat = new StandardMaterial(`tile-xw-mat-${this.coord.tx}-${this.coord.tz}`, this.scene);
    xwMat.diffuseColor = Color3.Black();
    xwMat.specularColor = Color3.Black();
    xwMat.emissiveColor = CROSSWALK;
    for (const s of crosswalkStripes(this.coord.tx, this.coord.tz)) {
      const bar = MeshBuilder.CreateGround(s.key, { width: s.size[0], height: s.size[1] }, this.scene);
      bar.position.set(s.center[0], s.center[1], s.center[2]);
      bar.material = xwMat;
      this.meshes.push(bar);
    }
  }

  /** Urban tiles add manhole-cover props on the road ring. */
  private allLoadProps(): TileProp[] {
    if (!this.urban) return this.props;
    const rng = tileRng(this.worldSeed, this.coord.tx + 7, this.coord.tz + 13); // decorrelated stream
    const manholes: TileProp[] = manholeSpots(this.coord.tx, this.coord.tz, rng).map((pos, i) => ({
      key: `t-manhole-${this.coord.tx}-${this.coord.tz}-${i}`, model: MANHOLE_MODEL, position: pos, solid: false,
    }));
    return [...this.props, ...manholes];
  }

  private buildBorderWalls(): void {
    for (const c of borderWallColliders(this.coord.tx, this.coord.tz)) {
      this.addCollider(
        new Vector3(c.position[0], c.position[1], c.position[2]),
        new Vector3(c.size[0], c.size[1], c.size[2]),
        c.key,
      );
    }
  }

  private async loadProps(list: TileProp[]): Promise<void> {
    const { SceneLoader } = await import('@babylonjs/core');
    await import('@babylonjs/loaders/glTF');
    for (const p of list) {
      if (this.disposed) return; // tile unloaded mid-stream
      try {
        const c = await SceneLoader.LoadAssetContainerAsync('/assets/', p.model, this.scene);
        c.addAllToScene();
        const holder = new TransformNode(p.key, this.scene);
        holder.position.set(p.position[0], p.position[1], p.position[2]);
        holder.rotation.y = p.rotationY ?? 0;
        if (Array.isArray(p.scale)) holder.scaling.set(p.scale[0], p.scale[1], p.scale[2]);
        else holder.scaling.setAll(p.scale ?? 1);
        for (const m of c.meshes) if (!m.parent) m.parent = holder;
        for (const t of c.transformNodes) if (!t.parent) t.parent = holder;
        if (p.fit) this.scaleToFit(holder, p.fit);
        this.meshes.push(...c.meshes);
        this.holders.push(holder);
        if (p.solid) this.addSolidCollider(holder, p.key);
      } catch {
        // missing/failed GLB → skip (tolerant, like loadRealAssets)
      }
    }
  }

  /** Uniformly scale a holder so its X/Z footprint fits within `fit` metres. */
  private scaleToFit(holder: TransformNode, fit: number): void {
    holder.computeWorldMatrix(true);
    const { min, max } = holder.getHierarchyBoundingVectors(true);
    const extent = Math.max(max.x - min.x, max.z - min.z);
    if (extent > 0.001 && extent > fit) holder.scaling.scaleInPlace(fit / extent);
  }

  private addSolidCollider(holder: TransformNode, key: string): void {
    if (!this.scene.isPhysicsEnabled()) return;
    holder.computeWorldMatrix(true);
    const { min, max } = holder.getHierarchyBoundingVectors(true);
    const size = max.subtract(min);
    if (size.x < 0.05 || size.y < 0.05 || size.z < 0.05) return;
    this.addCollider(min.add(max).scale(0.5), size, `tile-col-${key}`);
  }

  private addCollider(center: Vector3, size: Vector3, name: string): void {
    if (!this.scene.isPhysicsEnabled()) return;
    const box = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, this.scene);
    box.position.copyFrom(center);
    box.isVisible = false;
    const agg = new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
    this.meshes.push(box);
    this.aggregates.push(agg);
  }

  dispose(): void {
    this.disposed = true;
    this.aggregates.forEach((a) => a.dispose());
    this.aggregates = [];
    this.holders.forEach((h) => h.dispose());
    this.holders = [];
    this.meshes.forEach((m) => m.dispose());
    this.meshes = [];
  }
}
