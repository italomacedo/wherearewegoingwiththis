import { Scene, Vector3, AbstractMesh } from '@babylonjs/core';

export interface ZoneBounds {
  min: Vector3;
  max: Vector3;
}

/**
 * A discrete district of the world. Owns its terrain, props, lighting,
 * and (later) NPCs. Loaded/unloaded on demand by the ZoneManager.
 */
export abstract class WorldZone {
  abstract readonly id: string;
  abstract readonly displayName: string;

  protected scene: Scene | null = null;
  protected meshes: AbstractMesh[] = [];
  private loaded = false;

  /** Build all zone content into the scene. */
  async load(scene: Scene): Promise<void> {
    if (this.loaded) return;
    this.scene = scene;
    await this.build(scene);
    this.loaded = true;
  }

  /** Dispose all zone content. */
  unload(): void {
    if (!this.loaded) return;
    this.meshes.forEach((m) => m.dispose());
    this.meshes = [];
    this.onUnload();
    this.scene = null;
    this.loaded = false;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getMeshCount(): number {
    return this.meshes.length;
  }

  /** Default spawn point for the player entering this zone. */
  abstract getSpawnPoint(): Vector3;

  /** Walkable bounds of the zone. */
  abstract getBounds(): ZoneBounds;

  /** Subclasses build terrain/props/lights here. */
  protected abstract build(scene: Scene): Promise<void>;

  /** Optional cleanup hook (lights, particle systems, etc.). */
  protected onUnload(): void {
    // override if needed
  }
}
