/* istanbul ignore file -- browser-only Babylon scenery; the collider DATA + tile
 * math it consumes (WorldGrid/SeededRng) are unit-tested. Verified in Electron. */

/**
 * TileScenery — the BROWSER content of one procedural mosaic tile (Fase 17B).
 *
 * Phase B keeps this deliberately trivial (a themed ground plane + a few emissive
 * placeholder structures + the tile's world-border invisible walls) purely to
 * validate seamless streaming + multi-tile physics. Phase C replaces the visuals
 * with real GLBs from `generateTile`. The single shared world floor lives in
 * GameWorldScene; tiles add only their visuals + border-wall colliders.
 *
 * All meshes/aggregates are tracked and disposed together when the tile unloads
 * (mirrors MercadoSombrasZone.onUnload's holder/collider/aggregate discipline).
 */

import {
  Scene, MeshBuilder, StandardMaterial, Color3, AbstractMesh,
  PhysicsAggregate, PhysicsShapeType, Vector3,
} from '@babylonjs/core';
import {
  TILE_SIZE, tileCenter, tileLocalToWorld, borderWallColliders,
} from '@systems/world/WorldGrid';
import { tileRng, intRange, range } from '@systems/world/SeededRng';
import type { RollFn } from '@systems/SkillCheck';

export class TileScenery {
  private meshes: AbstractMesh[] = [];
  private aggregates: PhysicsAggregate[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly tx: number,
    private readonly tz: number,
    private readonly worldSeed: number,
  ) {}

  build(): void {
    const rng = tileRng(this.worldSeed, this.tx, this.tz);
    this.buildGround(rng);
    this.buildPlaceholders(rng);
    this.buildBorderWalls();
  }

  private buildGround(rng: RollFn): void {
    const [cx, , cz] = tileCenter(this.tx, this.tz);
    const ground = MeshBuilder.CreateGround(
      `tile-ground-${this.tx}-${this.tz}`, { width: TILE_SIZE, height: TILE_SIZE }, this.scene,
    );
    ground.position.set(cx, 0.0, cz);
    const mat = new StandardMaterial(`tile-ground-mat-${this.tx}-${this.tz}`, this.scene);
    // A seeded dark tint so each procedural tile reads as distinct from its neighbors.
    mat.diffuseColor = new Color3(0.10 + range(rng, 0, 0.12), 0.10 + range(rng, 0, 0.12), 0.14 + range(rng, 0, 0.14));
    mat.specularColor = new Color3(0, 0, 0);
    ground.material = mat;
    this.meshes.push(ground);
  }

  private buildPlaceholders(rng: RollFn): void {
    // A handful of emissive "buildings" so crossing into the tile is obvious.
    const count = intRange(rng, 2, 5);
    for (let i = 0; i < count; i++) {
      const h = range(rng, 4, 12);
      const w = range(rng, 3, 7);
      const lx = range(rng, -24, 24);
      const lz = range(rng, -24, 24);
      const [x, , z] = tileLocalToWorld(this.tx, this.tz, [lx, h / 2, lz]);
      const box = MeshBuilder.CreateBox(`tile-bld-${this.tx}-${this.tz}-${i}`, { width: w, height: h, depth: w }, this.scene);
      box.position.set(x, h / 2, z);
      const mat = new StandardMaterial(`tile-bld-mat-${this.tx}-${this.tz}-${i}`, this.scene);
      mat.diffuseColor = new Color3(0.05, 0.05, 0.08);
      mat.emissiveColor = new Color3(range(rng, 0, 0.3), range(rng, 0, 0.4), range(rng, 0.2, 0.6));
      box.material = mat;
      this.meshes.push(box);
      this.addCollider(box.position, new Vector3(w, h, w), `tile-col-bld-${this.tx}-${this.tz}-${i}`);
    }
  }

  private buildBorderWalls(): void {
    for (const c of borderWallColliders(this.tx, this.tz)) {
      this.addCollider(
        new Vector3(c.position[0], c.position[1], c.position[2]),
        new Vector3(c.size[0], c.size[1], c.size[2]),
        c.key,
      );
    }
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
    this.aggregates.forEach((a) => a.dispose());
    this.aggregates = [];
    this.meshes.forEach((m) => m.dispose());
    this.meshes = [];
  }
}
