/* istanbul ignore file -- browser-only Babylon scenery; the tile DATA it consumes
 * (ThemeRegistry.generateTile / WorldGrid colliders) is unit-tested. Verified in Electron. */

/**
 * TileScenery — the BROWSER content of one procedural mosaic tile (Fase 17).
 *
 * Loads the tile's generated props (real GLBs, via the same LoadAssetContainerAsync
 * + holder pattern as MercadoSombrasZone.loadRealAssets), builds a themed ground
 * plane, and adds the tile's world-border invisible walls. Solid props + border
 * walls get static box colliders. A missing/failed GLB is skipped (tolerant loader).
 *
 * All meshes/holders/aggregates are tracked and disposed together when the tile
 * unloads. The single shared world floor lives in GameWorldScene.
 */

import {
  Scene, MeshBuilder, StandardMaterial, Color3, AbstractMesh, TransformNode,
  PhysicsAggregate, PhysicsShapeType, Vector3,
} from '@babylonjs/core';
import { TILE_SIZE, tileCenter, borderWallColliders, type TileCoord } from '@systems/world/WorldGrid';
import { tileRng, range } from '@systems/world/SeededRng';
import type { TileProp } from '@assets/world/ThemeRegistry';

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
  ) {}

  async build(): Promise<void> {
    this.buildGround();
    this.buildBorderWalls();
    await this.loadProps();
  }

  private buildGround(): void {
    const { tx, tz } = this.coord;
    const rng = tileRng(this.worldSeed, tx, tz);
    const [cx, , cz] = tileCenter(tx, tz);
    const ground = MeshBuilder.CreateGround(`tile-ground-${tx}-${tz}`, { width: TILE_SIZE, height: TILE_SIZE }, this.scene);
    ground.position.set(cx, 0, cz);
    const mat = new StandardMaterial(`tile-ground-mat-${tx}-${tz}`, this.scene);
    // Themed base tint + a small seeded jitter so neighbours of the same theme vary.
    const [r, g, b] = this.groundColor;
    const j = range(rng, -0.02, 0.02);
    mat.diffuseColor = new Color3(r + j, g + j, b + j);
    mat.specularColor = new Color3(0, 0, 0);
    ground.material = mat;
    this.meshes.push(ground);
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

  private async loadProps(): Promise<void> {
    const { SceneLoader } = await import('@babylonjs/core');
    await import('@babylonjs/loaders/glTF');
    for (const p of this.props) {
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
        this.meshes.push(...c.meshes);
        this.holders.push(holder);
        if (p.solid) this.addSolidCollider(holder, p.key);
      } catch {
        // missing/failed GLB → skip (tolerant, like loadRealAssets)
      }
    }
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
