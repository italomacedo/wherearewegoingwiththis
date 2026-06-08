/* istanbul ignore file -- browser-only Babylon scenery; the tile DATA it consumes
 * (ThemeRegistry.generateTile / WorldGrid colliders / CityFrame / AssetCache dedup)
 * is unit-tested. Verified in Electron. */

/**
 * TileScenery — the BROWSER content of one procedural mosaic tile (Fase 17).
 *
 * URBAN tiles (downtown/market) get the city-grid frame (CityFrame): asphalt ▸
 * sidewalk ▸ themed interior planes + emissive crosswalks + manholes; buildings in
 * interior slots, scaled to fit. NATURE tiles get a full-tile themed ground + scattered
 * foliage. Props are CLONED from the shared `AssetCache` (each GLB parsed once,
 * instanced after) and INSTANTIATED A FEW PER FRAME via `step()` — the cheap sync
 * frame is built up front in `build()`; the heavy GLB work streams in over frames so
 * crossing a tile edge doesn't hitch (Fase 17H). All meshes/holders/aggregates dispose
 * together on unload.
 */

import {
  Scene, MeshBuilder, StandardMaterial, Color3, AbstractMesh, TransformNode,
  PhysicsAggregate, PhysicsShapeType, Vector3,
} from '@babylonjs/core';
import { borderWallColliders, type TileCoord } from '@systems/world/WorldGrid';
import { tileRng } from '@systems/world/SeededRng';
import { framePlanes, crosswalkStripes, manholeSpots } from '@assets/world/CityFrame';
import type { AssetCache } from '@systems/world/AssetCache';
import type { TileProp } from '@assets/world/ThemeRegistry';

const ASPHALT = new Color3(0.32, 0.32, 0.34); // mid grey road (was near-black)
const SIDEWALK = new Color3(0.46, 0.46, 0.50); // lighter grey curb
const CROSSWALK = new Color3(0.9, 0.92, 0.95);
const MANHOLE_MODEL = 'world/downtown/prop_manholecover.glb';

export class TileScenery {
  private meshes: AbstractMesh[] = [];
  private holders: TransformNode[] = [];
  private aggregates: PhysicsAggregate[] = [];
  private pending: TileProp[] = []; // props still to instantiate (streamed via step)
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly coord: TileCoord,
    private readonly props: TileProp[],
    private readonly worldSeed: number,
    private readonly groundColor: [number, number, number],
    private readonly urban: boolean,
  ) {}

  /** Cheap synchronous part: frame/crosswalks/border walls. Queues the GLB props.
   *  EVERY tile (urban AND nature) gets the asphalt+sidewalk road frame so the grid
   *  streets always have sidewalks on BOTH sides — the interior plane just takes the
   *  themed tint (green park, sand desert, …). (Owner fix.) */
  build(): void {
    this.buildUrbanFrame();
    this.buildBorderWalls();
    this.pending = this.allLoadProps();
  }

  /** How many props are still waiting to be instantiated. */
  pendingCount(): number {
    return this.pending.length;
  }

  /** Instantiate the next queued prop (cheap clone from the cache). Call a few per frame. */
  async step(cache: AssetCache): Promise<void> {
    const p = this.pending.shift();
    if (!p || this.disposed) return;
    const entries = await cache.instantiate(p.model, this.scene);
    if (!entries || this.disposed) {
      if (!entries && !this.disposed) console.warn('[WorldLoad] prop asset failed to instantiate', p.model);
      entries?.dispose();
      return;
    }
    const holder = new TransformNode(p.key, this.scene);
    holder.position.set(p.position[0], p.position[1], p.position[2]);
    holder.rotation.y = p.rotationY ?? 0;
    if (Array.isArray(p.scale)) holder.scaling.set(p.scale[0], p.scale[1], p.scale[2]);
    else holder.scaling.setAll(p.scale ?? 1);
    for (const n of entries.rootNodes) n.parent = holder;
    if (p.fit) this.scaleToFit(holder, p.fit);
    this.holders.push(holder);
    if (p.solid) this.addSolidCollider(holder, p.key);
  }

  /** Every tile: asphalt ▸ sidewalk ▸ themed-interior planes + crosswalks. The
   *  interior plane carries the theme tint (downtown grey, park green, sand…). */
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

  /** Urban tiles add manhole-cover props on the road ring (queued like other props). */
  private allLoadProps(): TileProp[] {
    if (!this.urban) return [...this.props];
    const rng = tileRng(this.worldSeed, this.coord.tx + 7, this.coord.tz + 13);
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
    // Force the (instanced) child meshes to bake their world matrix so the bounds
    // are valid — a stale/NaN bbox would make a malformed Havok box that aborts the
    // engine the moment the dynamic nave touches it on descent (Fase 17H crash fix).
    for (const m of holder.getChildMeshes()) m.computeWorldMatrix(true);
    const { min, max } = holder.getHierarchyBoundingVectors(true);
    const sx = max.x - min.x;
    const sy = max.y - min.y;
    const sz = max.z - min.z;
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const cz = (min.z + max.z) / 2;
    // Reject degenerate / non-finite / absurd bounds (instanced bbox can glitch).
    const ok = [sx, sy, sz, cx, cy, cz].every((v) => Number.isFinite(v))
      && sx >= 0.05 && sy >= 0.05 && sz >= 0.05
      && sx <= 300 && sy <= 300 && sz <= 300;
    if (!ok) return;
    this.addCollider(new Vector3(cx, cy, cz), new Vector3(sx, sy, sz), `tile-col-${key}`);
  }

  private addCollider(center: Vector3, size: Vector3, name: string): void {
    if (!this.scene.isPhysicsEnabled()) return;
    // Never feed Havok a non-finite/degenerate box (it aborts the engine natively).
    if (![size.x, size.y, size.z, center.x, center.y, center.z].every((v) => Number.isFinite(v))) return;
    if (size.x < 0.01 || size.y < 0.01 || size.z < 0.01) return;
    const box = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, this.scene);
    box.position.copyFrom(center);
    box.isVisible = false;
    const agg = new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
    this.meshes.push(box);
    this.aggregates.push(agg);
  }

  dispose(): void {
    this.disposed = true;
    this.pending = [];
    this.aggregates.forEach((a) => a.dispose());
    this.aggregates = [];
    this.holders.forEach((h) => h.dispose());
    this.holders = [];
    this.meshes.forEach((m) => m.dispose());
    this.meshes = [];
  }
}
