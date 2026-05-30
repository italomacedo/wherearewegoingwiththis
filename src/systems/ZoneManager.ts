import { Scene } from '@babylonjs/core';
import { WorldZone } from '@entities/WorldZone';
import { EventBus } from '@core/EventBus';
import { ServiceLocator } from '@core/ServiceLocator';

type ZoneFactory = () => WorldZone;

/**
 * Manages loading/unloading of WorldZones inside the persistent GameWorldScene.
 * Only one zone is active at a time in the MVP.
 */
export class ZoneManager {
  private registry = new Map<string, ZoneFactory>();
  private currentZone: WorldZone | null = null;
  private loading = false;

  register(id: string, factory: ZoneFactory): void {
    this.registry.set(id, factory);
  }

  isRegistered(id: string): boolean {
    return this.registry.has(id);
  }

  async loadZone(id: string, scene: Scene): Promise<WorldZone> {
    if (this.loading) {
      throw new Error('ZoneManager is already loading a zone.');
    }
    const factory = this.registry.get(id);
    if (!factory) {
      throw new Error(`Zone '${id}' not registered.`);
    }

    this.loading = true;
    try {
      this.unloadCurrent();
      const zone = factory();
      await zone.load(scene);
      this.currentZone = zone;

      const eventBus = ServiceLocator.tryGet<EventBus>('eventBus');
      eventBus?.emit('scene:loaded', { sceneName: `zone:${id}` });

      return zone;
    } finally {
      this.loading = false;
    }
  }

  getCurrentZone(): WorldZone | null {
    return this.currentZone;
  }

  getCurrentZoneId(): string | null {
    return this.currentZone?.id ?? null;
  }

  unloadCurrent(): void {
    if (this.currentZone) {
      this.currentZone.unload();
      this.currentZone = null;
    }
  }

  isLoading(): boolean {
    return this.loading;
  }

  dispose(): void {
    this.unloadCurrent();
    this.registry.clear();
  }
}
