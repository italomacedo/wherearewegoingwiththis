import { EventBus } from '../../../src/core/EventBus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  afterEach(() => {
    bus.clear();
  });

  it('emits events to registered listeners', () => {
    const handler = jest.fn();
    bus.on('scene:loaded', handler);
    bus.emit('scene:loaded', { sceneName: 'splash' });
    expect(handler).toHaveBeenCalledWith({ sceneName: 'splash' });
  });

  it('does not emit to unregistered events', () => {
    const handler = jest.fn();
    bus.on('scene:loaded', handler);
    bus.emit('save:created', { saveId: '123' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('removes listener with returned unsubscribe function', () => {
    const handler = jest.fn();
    const unsubscribe = bus.on('scene:loaded', handler);
    unsubscribe();
    bus.emit('scene:loaded', { sceneName: 'splash' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('off removes a specific listener', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    bus.on('scene:loaded', handler1);
    bus.on('scene:loaded', handler2);
    bus.off('scene:loaded', handler1);
    bus.emit('scene:loaded', { sceneName: 'test' });
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it('once fires exactly one time', () => {
    const handler = jest.fn();
    bus.once('scene:loaded', handler);
    bus.emit('scene:loaded', { sceneName: 'a' });
    bus.emit('scene:loaded', { sceneName: 'b' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ sceneName: 'a' });
  });

  it('clear removes all listeners', () => {
    const handler = jest.fn();
    bus.on('scene:loaded', handler);
    bus.on('save:created', handler);
    bus.clear();
    bus.emit('scene:loaded', { sceneName: 'x' });
    bus.emit('save:created', { saveId: '1' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('listenerCount returns correct count', () => {
    expect(bus.listenerCount('scene:loaded')).toBe(0);
    const unsub = bus.on('scene:loaded', jest.fn());
    bus.on('scene:loaded', jest.fn());
    expect(bus.listenerCount('scene:loaded')).toBe(2);
    unsub();
    expect(bus.listenerCount('scene:loaded')).toBe(1);
  });

  it('supports multiple event types independently', () => {
    const playerHandler = jest.fn();
    const saveHandler = jest.fn();
    bus.on('player:moved', playerHandler);
    bus.on('save:created', saveHandler);
    bus.emit('player:moved', { position: { x: 1, y: 0, z: 2 } });
    expect(playerHandler).toHaveBeenCalledTimes(1);
    expect(saveHandler).not.toHaveBeenCalled();
  });
});
