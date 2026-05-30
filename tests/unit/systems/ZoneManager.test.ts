import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { ZoneManager } from '../../../src/systems/ZoneManager';
import { WorldZone, ZoneBounds } from '../../../src/entities/WorldZone';
import { EventBus } from '../../../src/core/EventBus';
import { ServiceLocator } from '../../../src/core/ServiceLocator';

class TestZone extends WorldZone {
  readonly id: string;
  readonly displayName: string;
  buildCalled = false;
  unloadHookCalled = false;

  constructor(id = 'test-zone') {
    super();
    this.id = id;
    this.displayName = `Test ${id}`;
  }

  getSpawnPoint(): Vector3 {
    return new Vector3(1, 2, 3);
  }

  getBounds(): ZoneBounds {
    return { min: new Vector3(-5, 0, -5), max: new Vector3(5, 0, 5) };
  }

  protected async build(): Promise<void> {
    this.buildCalled = true;
  }

  protected onUnload(): void {
    this.unloadHookCalled = true;
  }
}

describe('ZoneManager', () => {
  let engine: NullEngine;
  let scene: Scene;
  let manager: ZoneManager;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    manager = new ZoneManager();
    ServiceLocator.register('eventBus', new EventBus());
  });

  afterEach(() => {
    manager.dispose();
    scene.dispose();
    engine.dispose();
    ServiceLocator.clear();
  });

  it('register adds a zone factory', () => {
    manager.register('test-zone', () => new TestZone());
    expect(manager.isRegistered('test-zone')).toBe(true);
  });

  it('isRegistered returns false for unknown zone', () => {
    expect(manager.isRegistered('unknown')).toBe(false);
  });

  it('loadZone builds and returns the zone', async () => {
    manager.register('test-zone', () => new TestZone());
    const zone = await manager.loadZone('test-zone', scene);
    expect(zone.id).toBe('test-zone');
    expect((zone as TestZone).buildCalled).toBe(true);
    expect(zone.isLoaded()).toBe(true);
  });

  it('loadZone throws for unregistered zone', async () => {
    await expect(manager.loadZone('missing', scene)).rejects.toThrow("Zone 'missing' not registered");
  });

  it('getCurrentZone returns the loaded zone', async () => {
    manager.register('test-zone', () => new TestZone());
    await manager.loadZone('test-zone', scene);
    expect(manager.getCurrentZone()?.id).toBe('test-zone');
  });

  it('getCurrentZoneId returns the id', async () => {
    manager.register('test-zone', () => new TestZone());
    await manager.loadZone('test-zone', scene);
    expect(manager.getCurrentZoneId()).toBe('test-zone');
  });

  it('getCurrentZoneId returns null when no zone loaded', () => {
    expect(manager.getCurrentZoneId()).toBeNull();
  });

  it('loading a new zone unloads the previous one', async () => {
    manager.register('zone-a', () => new TestZone('zone-a'));
    manager.register('zone-b', () => new TestZone('zone-b'));
    const a = await manager.loadZone('zone-a', scene);
    await manager.loadZone('zone-b', scene);
    expect((a as TestZone).unloadHookCalled).toBe(true);
    expect(a.isLoaded()).toBe(false);
    expect(manager.getCurrentZoneId()).toBe('zone-b');
  });

  it('unloadCurrent unloads and clears current zone', async () => {
    manager.register('test-zone', () => new TestZone());
    await manager.loadZone('test-zone', scene);
    manager.unloadCurrent();
    expect(manager.getCurrentZone()).toBeNull();
  });

  it('unloadCurrent is safe when no zone loaded', () => {
    expect(() => manager.unloadCurrent()).not.toThrow();
  });

  it('emits scene:loaded event on zone load', async () => {
    const eventBus = ServiceLocator.get<EventBus>('eventBus');
    const handler = jest.fn();
    eventBus.on('scene:loaded', handler);
    manager.register('test-zone', () => new TestZone());
    await manager.loadZone('test-zone', scene);
    expect(handler).toHaveBeenCalledWith({ sceneName: 'zone:test-zone' });
  });

  it('works without eventBus registered', async () => {
    ServiceLocator.unregister('eventBus');
    manager.register('test-zone', () => new TestZone());
    await expect(manager.loadZone('test-zone', scene)).resolves.toBeDefined();
  });

  it('isLoading is false after load completes', async () => {
    manager.register('test-zone', () => new TestZone());
    await manager.loadZone('test-zone', scene);
    expect(manager.isLoading()).toBe(false);
  });

  it('throws if loadZone called while already loading', async () => {
    // A zone whose build() hangs until we release it
    let release!: () => void;
    class SlowZone extends TestZone {
      protected async build(): Promise<void> {
        await new Promise<void>((r) => { release = r; });
      }
    }
    manager.register('slow', () => new SlowZone('slow'));
    manager.register('test-zone', () => new TestZone());

    const first = manager.loadZone('slow', scene);
    expect(manager.isLoading()).toBe(true);

    await expect(manager.loadZone('test-zone', scene)).rejects.toThrow('already loading');

    release();
    await first;
    expect(manager.isLoading()).toBe(false);
  });

  it('dispose unloads current and clears registry', async () => {
    manager.register('test-zone', () => new TestZone());
    await manager.loadZone('test-zone', scene);
    manager.dispose();
    expect(manager.getCurrentZone()).toBeNull();
    expect(manager.isRegistered('test-zone')).toBe(false);
  });
});
